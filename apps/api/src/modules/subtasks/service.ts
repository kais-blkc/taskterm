import { and, asc, eq } from 'drizzle-orm';
import {
  canAddSubtask,
  canChangeSubtask,
  canEditField,
  canEditTask,
  type ServerEvent,
} from '@taskterm/shared';
import { bindDb, byId, first, type Db } from '../../db/client';
import { boardMembers, subtasks, taskAssignees } from '../../db/schema';
import { NotFoundError } from '../boards/service';
import type { AuthUser } from '../auth/service';
import { subtaskAssigneeNotice, subtaskDoneNotice } from '../notify/events';
import { subtaskDoneRecipients } from '../notify/settings';
import {
  ForbiddenError,
  LOCKED_MESSAGE,
  OWN_TASKS_MESSAGE,
  actorOf,
  requireSubtaskBoard,
  requireTaskCan,
} from '../permissions/access';
import { BadRequestError, getTask } from '../tasks/service';

export async function getSubtask(db: Db, id: number) {
  return byId(db, subtasks, id, 'subtask');
}

async function listSubtasksRows(db: Db, taskId: number) {
  await getTask(db, taskId);
  return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.id));
}

async function createSubtaskRow(db: Db, taskId: number, title: string, userId: number) {
  const task = await getTask(db, taskId);
  const [row] = await db.insert(subtasks).values({ taskId, title, createdBy: userId }).returning();
  return { subtask: row!, boardId: task.boardId };
}

async function createSubtasksRows(db: Db, taskId: number, items: { title: string; done?: boolean }[], userId: number) {
  const task = await getTask(db, taskId);
  const rows = items.length
    ? await db
        .insert(subtasks)
        .values(items.map((it) => ({ taskId, title: it.title, done: it.done ?? false, createdBy: userId })))
        .returning()
    : [];
  // порядок вставки = порядок id; returning отдаёт строки в порядке values
  return { subtasks: rows, boardId: task.boardId };
}

type SubtaskPatch = { title?: string; done?: boolean; assigneeId?: number | null };

async function updateSubtaskRow(db: Db, id: number, patch: SubtaskPatch) {
  const current = await getSubtask(db, id);
  const task = await getTask(db, current.taskId);
  const row = Object.keys(patch).length
    ? await db.transaction(async (tx) => {
        // назначенный на пункт сам становится ответственным задачи (чтобы «исполнитель пункта ⊆ ответственные задачи»)
        if (patch.assigneeId != null && !task.assigneeIds.includes(patch.assigneeId)) {
          await tx.insert(taskAssignees).values({ taskId: task.id, userId: patch.assigneeId }).onConflictDoNothing();
        }
        return first(await tx.update(subtasks).set(patch).where(eq(subtasks.id, id)).returning())!;
      })
    : current;
  return { subtask: row, boardId: task.boardId, task, wasDone: current.done, prevAssigneeId: current.assigneeId };
}

async function deleteSubtaskRow(db: Db, id: number) {
  const current = await getSubtask(db, id);
  const task = await getTask(db, current.taskId);
  await db.delete(subtasks).where(eq(subtasks.id, id));
  return { taskId: current.taskId, boardId: task.boardId };
}

// ─── Сценарии (use cases): права → изменение → события; шину отдаёт роут ──────

// подзадачи меняют счётчики на карточках (board) и список в открытой модалке (subtasks)
const changed = (by: number, taskId: number, boardId: number): ServerEvent[] => [
  { type: 'subtasks', boardId, taskId, by },
  { type: 'board', boardId, by },
];

/** Отметка — всем, кто редактирует задачи; переименование/удаление — по политике задачи */
async function guardSubtask(db: Db, user: AuthUser, id: number) {
  const { subtask, task: raw, role } = await requireSubtaskBoard(db, user, id);
  const task = await getTask(db, raw.id); // с ответственными: «свой» в задаче = автор или ответственный
  const actor = actorOf(task, user, role);
  if (!canEditTask(actor)) throw new ForbiddenError(OWN_TASKS_MESSAGE);
  // отметить, переименовать, назначить, удалить — только свой пункт (создал или назначен тебе), если owner задачи не включил «free»
  if (!canChangeSubtask(task.policy, actor, subtask, user.id)) throw new ForbiddenError(LOCKED_MESSAGE);
  return { subtask, task, actor };
}

/** Назначить пункт: тот же круг, что меняет пункт; исполнитель — участник доски; если его ещё нет среди ответственных задачи — это правка ответственных, её может закрыть политика */
async function guardAssignee(db: Db, task: Awaited<ReturnType<typeof getTask>>, actor: ReturnType<typeof actorOf>, assigneeId: number) {
  const member = first(await db.select({ id: boardMembers.userId }).from(boardMembers).where(and(eq(boardMembers.boardId, task.boardId), eq(boardMembers.userId, assigneeId))));
  if (!member) throw new BadRequestError('исполнитель должен быть участником доски');
  if (!task.assigneeIds.includes(assigneeId) && !canEditField(task.policy, actor, 'assignee')) throw new ForbiddenError(LOCKED_MESSAGE);
}

async function guardAdd(db: Db, user: AuthUser, taskId: number) {
  const { task, role } = await requireTaskCan(db, user, taskId, 'editTask');
  if (!canAddSubtask(task.policy, actorOf(task, user, role))) throw new ForbiddenError(LOCKED_MESSAGE);
}

async function listSubtasks(db: Db, user: AuthUser, taskId: number) {
  await requireTaskCan(db, user, taskId, 'view');
  return listSubtasksRows(db, taskId);
}

async function createSubtask(db: Db, user: AuthUser, taskId: number, title: string) {
  await guardAdd(db, user, taskId);
  const { subtask, boardId } = await createSubtaskRow(db, taskId, title, user.id);
  return { subtask, events: changed(user.id, subtask.taskId, boardId) };
}

/** Пачкой: список из текста (одна транзакция, одно событие для остальных клиентов) */
async function createSubtasks(db: Db, user: AuthUser, taskId: number, items: { title: string; done?: boolean }[]) {
  await guardAdd(db, user, taskId);
  const { subtasks, boardId } = await createSubtasksRows(db, taskId, items, user.id);
  return { subtasks, events: changed(user.id, taskId, boardId) };
}

async function updateSubtask(db: Db, user: AuthUser, id: number, patch: SubtaskPatch) {
  const { task: before, actor } = await guardSubtask(db, user, id);
  if (patch.assigneeId != null) await guardAssignee(db, before, actor, patch.assigneeId);
  const { subtask, boardId, task, wasDone, prevAssigneeId } = await updateSubtaskRow(db, id, patch);
  const events = changed(user.id, subtask.taskId, boardId);
  // пункт отметили выполненным (был не выполнен) — админам, если уведомление включено
  if (subtask.done && !wasDone) {
    const notice = subtaskDoneNotice(task, user, subtask.title, await subtaskDoneRecipients(db, user.id));
    if (notice) events.push(notice);
  }
  // назначили / переназначили / сняли — уведомляем затронутых (кроме самого действующего)
  if (subtask.assigneeId !== prevAssigneeId) {
    if (subtask.assigneeId != null && subtask.assigneeId !== user.id)
      events.push(subtaskAssigneeNotice('subtask_assigned', task, user, subtask.title, subtask.assigneeId));
    if (prevAssigneeId != null && prevAssigneeId !== user.id)
      events.push(subtaskAssigneeNotice('subtask_unassigned', task, user, subtask.title, prevAssigneeId));
  }
  return { subtask, events };
}

async function deleteSubtask(db: Db, user: AuthUser, id: number) {
  await guardSubtask(db, user, id);
  const { taskId, boardId } = await deleteSubtaskRow(db, id);
  return { events: changed(user.id, taskId, boardId) };
}

/** Сервис, привязанный к БД: `const svc = createSubtaskService(db)`; внутри транзакции — `createSubtaskService(tx)` */
export const createSubtaskService = (db: Db) =>
  bindDb(db, { listSubtasks, createSubtask, createSubtasks, updateSubtask, deleteSubtask });
