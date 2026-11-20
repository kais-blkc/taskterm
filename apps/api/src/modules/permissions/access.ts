import { and, eq } from 'drizzle-orm';
import { canEditTask, isAdminRole, roleCan, taskActor, type BoardAction, type BoardRole, type TaskActor } from '@taskterm/shared';
import { byId, first, type Db } from '../../db/client';
import { boardMembers, boards, columns, comments, subtasks, tasks } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { withAssignee } from '../tasks/assignees';

import { NotFoundError, ForbiddenError } from '../../errors';

export { NotFoundError, ForbiddenError };

/**
 * Эффективная роль на доске: админ приложения — owner везде, остальные — по board_members.
 * null — доски нет или пользователь не участник.
 */
export async function boardRoleOf(db: Db, user: AuthUser, boardId: number): Promise<BoardRole | null> {
  if (isAdminRole(user.role)) {
    const exists = first(await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)));
    return exists ? 'owner' : null;
  }
  const row = first(
    await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, user.id))),
  );
  return row?.role ?? null;
}

/**
 * Проверка права на доске. Не участнику отвечаем 404 (существование доски не раскрываем),
 * участнику с недостаточной ролью — 403. Возвращает роль.
 */
export async function requireBoardCan(db: Db, user: AuthUser, boardId: number, action: BoardAction): Promise<BoardRole> {
  const role = await boardRoleOf(db, user, boardId);
  if (!role) throw new NotFoundError('доска не найдена');
  if (!roleCan(role, action)) throw new ForbiddenError('недостаточно прав для этого действия');
  // защищённая админом доска: управлять ею (название, колонки, участники, удаление) могут только админы
  if (action === 'manageBoard' && !isAdminRole(user.role)) {
    const b = first(await db.select({ managed: boards.managedByAdmin }).from(boards).where(eq(boards.id, boardId)));
    if (b?.managed) throw new ForbiddenError('доска защищена: управлять ею могут только администраторы');
  }
  return role;
}

/** Доска задачи/колонки/комментария/подзадачи → проверка права. 404, если сущности нет. */
export async function requireTaskCan(db: Db, user: AuthUser, taskId: number, action: BoardAction) {
  const task = await byId(db, tasks, taskId, 'task');
  const role = await requireBoardCan(db, user, task.boardId, action).catch((e) => {
    // не участник не должен узнать, что задача существует
    if (e instanceof NotFoundError) throw new NotFoundError('задача не найдена');
    throw e;
  });
  const full = await withAssignee(db, task);
  // редактор правит только «свои» задачи (автор или ответственный); в чужих — смотрит и комментирует
  if (action === 'editTask' && !canEditTask(taskActor(full, user.id, role))) throw new ForbiddenError(OWN_TASKS_MESSAGE);
  return { task: full, role };
}

export async function requireColumnCan(db: Db, user: AuthUser, columnId: number, action: BoardAction) {
  const col = await byId(db, columns, columnId, 'column');
  const role = await requireBoardCan(db, user, col.boardId, action).catch((e) => {
    if (e instanceof NotFoundError) throw new NotFoundError('колонка не найдена');
    throw e;
  });
  return { column: col, role };
}

export async function requireCommentBoard(db: Db, user: AuthUser, commentId: number) {
  const row = first(
    await db
      .select({ comment: comments, boardId: tasks.boardId })
      .from(comments)
      .innerJoin(tasks, eq(tasks.id, comments.taskId))
      .where(eq(comments.id, commentId)),
  );
  if (!row) throw new NotFoundError('комментарий не найден');
  const role = await boardRoleOf(db, user, row.boardId);
  if (!role) throw new NotFoundError('комментарий не найден');
  return { comment: row.comment, boardId: row.boardId, role };
}

export async function requireSubtaskBoard(db: Db, user: AuthUser, subtaskId: number) {
  const row = first(
    await db
      .select({ subtask: subtasks, task: tasks })
      .from(subtasks)
      .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
      .where(eq(subtasks.id, subtaskId)),
  );
  if (!row) throw new NotFoundError('подзадача не найдена');
  const role = await boardRoleOf(db, user, row.task.boardId);
  if (!role) throw new NotFoundError('подзадача не найдена');
  return { subtask: row.subtask, task: row.task, role };
}

/** id досок, доступных пользователю (null — все, для админа) */
export async function accessibleBoardIds(db: Db, user: AuthUser): Promise<Set<number> | null> {
  if (isAdminRole(user.role)) return null;
  const rows = await db.select({ id: boardMembers.boardId }).from(boardMembers).where(eq(boardMembers.userId, user.id));
  return new Set(rows.map((r) => r.id));
}

/** Действующее лицо для проверки политики задачи */
export function actorOf(task: { authorId: number; assigneeIds: number[] }, user: AuthUser, role: BoardRole | null): TaskActor {
  return taskActor(task, user.id, role);
}

export const OWN_TASKS_MESSAGE = 'редактор может менять только свои задачи (где он автор или ответственный)';

export const LOCKED_MESSAGE = 'закрыто владельцем задачи';
