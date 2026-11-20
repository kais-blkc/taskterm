import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import {
  canDeleteTask,
  canEditField,
  canManageTask,
  roleCan,
  type MoveTaskInput,
  type PolicyField,
  type ServerEvent,
  type TaskPolicy,
} from '@taskterm/shared';
import { bindDb, byId, first, type Db } from '../../db/client';
import { boardMembers, boards, columns, subtasks, taskAssignees, tasks } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { audit } from '../audit/service';
import { columnMoveNotice } from '../boards/column-notify';
import { NotFoundError } from '../boards/service';
import { attachmentKeys } from '../attachments/service';
import { assignedNotice, unassignedNotice } from '../notify/events';
import {
  ForbiddenError,
  LOCKED_MESSAGE,
  actorOf,
  requireBoardCan,
  requireTaskCan,
} from '../permissions/access';
import { withAssignee } from './assignees';

export class BadRequestError extends Error {
  status = 400;
}

export async function getTask(db: Db, id: number) {
  return withAssignee(db, await byId(db, tasks, id, 'task'));
}

function createTaskRow(
  db: Db,
  boardId: number,
  authorId: number,
  input: { columnId: number; title: string; description?: string; dueDate?: string },
) {
  return db.transaction(async (tx) => {
    // атомарно занимаем номер: два параллельных запроса не получат один и тот же
    const taken = first(
      await tx
        .update(boards)
        .set({ nextTaskNumber: sql`${boards.nextTaskNumber} + 1` })
        .where(eq(boards.id, boardId))
        .returning({ next: boards.nextTaskNumber }),
    );
    if (!taken) throw new NotFoundError('доска не найдена');
    const col = first(await tx.select().from(columns).where(eq(columns.id, input.columnId)));
    if (!col || col.boardId !== boardId)
      throw new BadRequestError('колонка не принадлежит этой доске');

    const last = (
      await tx
        .select({ position: tasks.position })
        .from(tasks)
        .where(eq(tasks.columnId, col.id))
        .orderBy(asc(tasks.position))
    ).at(-1);

    const [row] = await tx
      .insert(tasks)
      .values({
        boardId,
        columnId: col.id,
        number: taken.next - 1,
        title: input.title,
        description: input.description ?? '',
        dueDate: input.dueDate ?? null,
        position: generateKeyBetween(last?.position ?? null, null),
        authorId,
      })
      .returning();
    return { ...row!, assigneeIds: [] as number[] };
  });
}

async function updateTaskRow(
  db: Db,
  id: number,
  patch: { title?: string; description?: string; assigneeIds?: number[]; dueDate?: string | null },
) {
  const task = await getTask(db, id);
  const { assigneeIds, ...fields } = patch;
  const ids = assigneeIds ? [...new Set(assigneeIds)] : undefined;
  if (ids?.length) {
    // ответственные — только участники доски
    const members = await db
      .select({ userId: boardMembers.userId })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, task.boardId), inArray(boardMembers.userId, ids)));
    if (members.length !== ids.length) throw new BadRequestError('исполнитель должен быть участником доски');
  }
  await db.transaction(async (tx) => {
    // смена одних только ответственных — тоже правка задачи: `set({})` Drizzle не принимает, а $onUpdate на пустой set не срабатывает
    await tx
      .update(tasks)
      .set(Object.keys(fields).length ? fields : { updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id));
    if (ids) {
      // снимаем убранных, добавляем новых в конец; у оставшихся порядок не меняется
      const removed = task.assigneeIds.filter((u) => !ids.includes(u));
      if (removed.length)
        await tx
          .delete(taskAssignees)
          .where(and(eq(taskAssignees.taskId, id), inArray(taskAssignees.userId, removed)));
      // снятый с задачи перестаёт быть исполнителем её подзадач
      if (removed.length)
        await tx
          .update(subtasks)
          .set({ assigneeId: null })
          .where(and(eq(subtasks.taskId, id), inArray(subtasks.assigneeId, removed)));
      const base = Date.now();
      const added = ids.filter((u) => !task.assigneeIds.includes(u));
      if (added.length)
        await tx.insert(taskAssignees).values(
          added.map((userId, i) => ({
            taskId: id,
            userId,
            createdAt: new Date(base + i).toISOString(),
          })),
        );
    }
  });
  return getTask(db, id);
}

async function setPolicyRow(db: Db, id: number, policy: TaskPolicy) {
  const row = first(await db.update(tasks).set({ policy }).where(eq(tasks.id, id)).returning());
  if (!row) throw new NotFoundError('задача не найдена');
  return withAssignee(db, row);
}

/** Новый owner — участник доски, который может редактировать задачи (владелец доски/редактор) */
async function transferOwnerRow(db: Db, id: number, userId: number) {
  const task = await getTask(db, id);
  const member = first(
    await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, task.boardId), eq(boardMembers.userId, userId))),
  );
  if (!member || !roleCan(member.role, 'editTask'))
    throw new BadRequestError('новый владелец должен быть редактором или владельцем доски');
  const [row] = await db
    .update(tasks)
    .set({ authorId: userId })
    .where(eq(tasks.id, id))
    .returning();
  return withAssignee(db, row!);
}

async function deleteTaskRow(db: Db, id: number) {
  const row = first(
    await db.delete(tasks).where(eq(tasks.id, id)).returning({ boardId: tasks.boardId }),
  );
  if (!row) throw new NotFoundError('задача не найдена');
  return row.boardId;
}

function moveTaskRow(db: Db, id: number, input: MoveTaskInput) {
  return db.transaction(async (tx) => {
    const task = await getTask(tx, id);
    const col = first(await tx.select().from(columns).where(eq(columns.id, input.columnId)));
    if (!col || col.boardId !== task.boardId)
      throw new BadRequestError('колонка не принадлежит этой доске');

    const siblings = await tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.columnId, col.id), ne(tasks.id, id)))
      .orderBy(asc(tasks.position));

    let idx = siblings.length;
    if (input.beforeId !== null) {
      idx = siblings.findIndex((s) => s.id === input.beforeId);
      if (idx === -1) throw new BadRequestError('указанная задача не находится в целевой колонке');
    }
    const position = generateKeyBetween(
      siblings[idx - 1]?.position ?? null,
      siblings[idx]?.position ?? null,
    );
    const [row] = await tx
      .update(tasks)
      .set({ columnId: col.id, position })
      .where(eq(tasks.id, id))
      .returning();
    return withAssignee(tx, row!);
  });
}

// ─── Сценарии (use cases) ───────────────────────────────────────────────────
// Проверка прав → изменение → журнал → события. Шину не трогаем: возвращаем `events`,
// а роут отдаёт их в hub.emit. Так сервис проверяется без HTTP и без шины.

type Result = { task: Awaited<ReturnType<typeof getTask>>; events: ServerEvent[] };
const boardChanged = (boardId: number, by: number): ServerEvent => ({ type: 'board', boardId, by });
const sameSet = (a: number[], b: number[]) => {
  const A = new Set(a);
  const B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};
const taskTarget = (t: { boardId: number; number: number }) => `task:${t.boardId}/#${t.number}`;

async function createTask(
  db: Db,
  user: AuthUser,
  boardId: number,
  input: Parameters<typeof createTaskRow>[3],
): Promise<Result> {
  await requireBoardCan(db, user, boardId, 'createTask');
  const task = await createTaskRow(db, boardId, user.id, input);
  return { task, events: [boardChanged(task.boardId, user.id)] };
}

async function updateTask(
  db: Db,
  user: AuthUser,
  id: number,
  patch: Parameters<typeof updateTaskRow>[2],
): Promise<Result> {
  const { task: before, role } = await requireTaskCan(db, user, id, 'editTask');
  // политика задачи: проверяем только поля, которые реально меняются
  const actor = actorOf(before, user, role);
  const touched: PolicyField[] = [];
  if (patch.title !== undefined && patch.title !== before.title) touched.push('title');
  if (patch.description !== undefined && patch.description !== before.description)
    touched.push('description');
  if (patch.assigneeIds !== undefined && !sameSet(patch.assigneeIds, before.assigneeIds))
    touched.push('assignee');
  if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) touched.push('dueDate');
  for (const f of touched)
    if (!canEditField(before.policy, actor, f)) throw new ForbiddenError(LOCKED_MESSAGE);

  const task = await updateTaskRow(db, id, patch);
  const events: ServerEvent[] = [boardChanged(task.boardId, user.id)];
  // назначили новых людей / сняли с задачи (не себя) — им уведомление
  for (const n of [assignedNotice(before, task, user), unassignedNotice(before, task, user)])
    if (n) events.push(n);
  return { task, events };
}

async function deleteTask(db: Db, user: AuthUser, id: number): Promise<{ events: ServerEvent[]; files: string[] }> {
  const { task, role } = await requireTaskCan(db, user, id, 'view');
  if (!canDeleteTask(role, task.authorId === user.id))
    throw new ForbiddenError('недостаточно прав для этого действия');
  const files = await attachmentKeys(db, { taskId: id }); // файлы убирает роут: БД удалит только записи
  const boardId = await deleteTaskRow(db, id);
  return { events: [boardChanged(boardId, user.id)], files };
}

async function moveTask(db: Db, user: AuthUser, id: number, input: MoveTaskInput): Promise<Result> {
  const { task: before, role } = await requireTaskCan(db, user, id, 'editTask');
  if (!canEditField(before.policy, actorOf(before, user, role), 'move'))
    throw new ForbiddenError(LOCKED_MESSAGE);
  const task = await moveTaskRow(db, id, input);
  const events: ServerEvent[] = [boardChanged(task.boardId, user.id)];
  // перенос в колонку с включёнными уведомлениями («На проверке») — настроенным получателям
  const moved = await columnMoveNotice(db, before, task, user);
  if (moved) events.push(moved);
  return { task, events };
}

/** Политику меняет owner задачи, владелец доски или админ */
async function setPolicy(db: Db, user: AuthUser, id: number, policy: TaskPolicy): Promise<Result> {
  const { task, role } = await requireTaskCan(db, user, id, 'view');
  if (!canManageTask(actorOf(task, user, role)))
    throw new ForbiddenError('менять права может только владелец задачи');
  const updated = await setPolicyRow(db, task.id, policy);
  await audit(db, user, 'task.policy', taskTarget(task), policy);
  return { task: updated, events: [boardChanged(task.boardId, user.id)] };
}

/** Передача владения: owner задачи, владелец доски или админ; новый owner — участник доски с правом редактировать */
async function transferOwner(db: Db, user: AuthUser, id: number, userId: number): Promise<Result> {
  const { task, role } = await requireTaskCan(db, user, id, 'view');
  if (!canManageTask(actorOf(task, user, role)))
    throw new ForbiddenError('передать задачу может только её владелец');
  const updated = await transferOwnerRow(db, task.id, userId);
  await audit(db, user, 'task.owner', taskTarget(task), { toUserId: userId });
  return { task: updated, events: [boardChanged(task.boardId, user.id)] };
}

/** Сервис, привязанный к БД: `const svc = createTaskService(db)`; внутри транзакции — `createTaskService(tx)` */
export const createTaskService = (db: Db) =>
  bindDb(db, { createTask, updateTask, deleteTask, moveTask, setPolicy, transferOwner });
