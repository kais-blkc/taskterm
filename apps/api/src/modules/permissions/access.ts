import { and, eq } from 'drizzle-orm';
import { roleCan, type BoardAction, type BoardRole } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { boardMembers, boards, columns, comments, subtasks, tasks } from '../../db/schema';
import type { AuthUser } from '../auth/service';

export class NotFoundError extends Error {
  status = 404;
}
export class ForbiddenError extends Error {
  status = 403;
}

/**
 * Эффективная роль на доске: админ приложения — owner везде, остальные — по board_members.
 * null — доски нет или пользователь не участник.
 */
export async function boardRoleOf(db: Db, user: AuthUser, boardId: number): Promise<BoardRole | null> {
  if (user.role === 'admin') {
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
  if (!role) throw new NotFoundError('board not found');
  if (!roleCan(role, action)) throw new ForbiddenError('not allowed for your role');
  return role;
}

/** Доска задачи/колонки/комментария/подзадачи → проверка права. 404, если сущности нет. */
export async function requireTaskCan(db: Db, user: AuthUser, taskId: number, action: BoardAction) {
  const task = first(await db.select().from(tasks).where(eq(tasks.id, taskId)));
  if (!task) throw new NotFoundError('task not found');
  const role = await requireBoardCan(db, user, task.boardId, action).catch((e) => {
    // не участник не должен узнать, что задача существует
    if (e instanceof NotFoundError) throw new NotFoundError('task not found');
    throw e;
  });
  return { task, role };
}

export async function requireColumnCan(db: Db, user: AuthUser, columnId: number, action: BoardAction) {
  const col = first(await db.select().from(columns).where(eq(columns.id, columnId)));
  if (!col) throw new NotFoundError('column not found');
  const role = await requireBoardCan(db, user, col.boardId, action).catch((e) => {
    if (e instanceof NotFoundError) throw new NotFoundError('column not found');
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
  if (!row) throw new NotFoundError('comment not found');
  const role = await boardRoleOf(db, user, row.boardId);
  if (!role) throw new NotFoundError('comment not found');
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
  if (!row) throw new NotFoundError('subtask not found');
  const role = await boardRoleOf(db, user, row.task.boardId);
  if (!role) throw new NotFoundError('subtask not found');
  return { subtask: row.subtask, task: row.task, role };
}

/** id досок, доступных пользователю (null — все, для админа) */
export async function accessibleBoardIds(db: Db, user: AuthUser): Promise<Set<number> | null> {
  if (user.role === 'admin') return null;
  const rows = await db.select({ id: boardMembers.boardId }).from(boardMembers).where(eq(boardMembers.userId, user.id));
  return new Set(rows.map((r) => r.id));
}
