import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { defaultColumnNames, roleCan, type BoardRole } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { boardMembers, boards, columnNotifyUsers, columns, subtasks, taskAssignees, tasks, users } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { NotFoundError } from '../permissions/access';
import { withAssignees } from '../tasks/assignees';
import { withColumnNotify } from './column-notify';

export { NotFoundError };

/** Доска + роль пользователя + может ли он ею управлять (с учётом защиты админом) */
export function withAccess<B extends { managedByAdmin: boolean }>(board: B, myRole: BoardRole, isAdmin: boolean) {
  return { ...board, myRole, canManage: roleCan(myRole, 'manageBoard') && (isAdmin || !board.managedByAdmin) };
}

/** Доски, доступные пользователю, с его ролью. Админ приложения видит все как owner. */
export async function listBoards(db: Db, user: AuthUser) {
  if (user.role === 'admin') {
    return (await db.select().from(boards).orderBy(asc(boards.id))).map((b) => withAccess(b, 'owner', true));
  }
  const rows = await db
    .select({ board: boards, myRole: boardMembers.role })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .where(eq(boardMembers.userId, user.id))
    .orderBy(asc(boards.id));
  return rows.map((r) => withAccess(r.board, r.myRole, false));
}

/** Доска, созданная админом, сразу под управлением админов (managedByAdmin) */
export function createBoard(db: Db, name: string, userId: number, isAdmin = false) {
  return db.transaction(async (tx) => {
    const [board] = await tx.insert(boards).values({ name, createdBy: userId, managedByAdmin: isAdmin }).returning();
    await tx.insert(boardMembers).values({ boardId: board!.id, userId, role: 'owner' });
    let prev: string | null = null;
    for (const colName of defaultColumnNames) {
      prev = generateKeyBetween(prev, null);
      await tx.insert(columns).values({ boardId: board!.id, name: colName, position: prev });
    }
    return withAccess(board!, 'owner', isAdmin);
  });
}

export async function updateBoard(db: Db, id: number, name: string, myRole: BoardRole, isAdmin: boolean) {
  const row = first(await db.update(boards).set({ name }).where(eq(boards.id, id)).returning());
  if (!row) throw new NotFoundError('board not found');
  return withAccess(row, myRole, isAdmin);
}

export async function deleteBoard(db: Db, id: number) {
  const rows = await db.delete(boards).where(eq(boards.id, id)).returning({ id: boards.id });
  if (!rows.length) throw new NotFoundError('board not found');
}

export async function getBoardFull(db: Db, id: number, myRole: BoardRole, isAdmin: boolean) {
  const board = first(await db.select().from(boards).where(eq(boards.id, id)));
  if (!board) throw new NotFoundError('board not found');
  return {
    board: withAccess(board, myRole, isAdmin),
    columns: await withColumnNotify(db, await db.select().from(columns).where(eq(columns.boardId, id)).orderBy(asc(columns.position))),
    tasks: await withAssignees(db, await db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(asc(tasks.position))),
    subtaskStats: await db
      .select({
        taskId: subtasks.taskId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`count(*) filter (where ${subtasks.done})`.mapWith(Number),
      })
      .from(subtasks)
      .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
      .where(eq(tasks.boardId, id))
      .groupBy(subtasks.taskId),
  };
}

export async function createColumn(db: Db, boardId: number, name: string) {
  const board = first(await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)));
  if (!board) throw new NotFoundError('board not found');
  const last = (
    await db
      .select({ position: columns.position })
      .from(columns)
      .where(eq(columns.boardId, boardId))
      .orderBy(asc(columns.position))
  ).at(-1);
  const position = generateKeyBetween(last?.position ?? null, null);
  const [row] = await db.insert(columns).values({ boardId, name, position }).returning();
  return { ...row!, notifyUserIds: [] as number[] };
}

export class ColumnError extends Error {
  status = 400;
}

export async function updateColumn(
  db: Db,
  id: number,
  patch: { name?: string; notifyOnEnter?: boolean; notifyUserIds?: number[] },
) {
  const col = first(await db.select().from(columns).where(eq(columns.id, id)));
  if (!col) throw new NotFoundError('column not found');
  const ids = patch.notifyUserIds ? [...new Set(patch.notifyUserIds)] : undefined;
  if (ids?.length) {
    // получатели — только участники этой доски
    const members = await db
      .select({ userId: boardMembers.userId })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, col.boardId), inArray(boardMembers.userId, ids)));
    if (members.length !== ids.length) throw new ColumnError('recipient is not a board member');
  }
  const fields = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.notifyOnEnter !== undefined ? { notifyOnEnter: patch.notifyOnEnter } : {}),
  };
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length) await tx.update(columns).set(fields).where(eq(columns.id, id));
    if (ids) {
      await tx.delete(columnNotifyUsers).where(eq(columnNotifyUsers.columnId, id));
      if (ids.length) await tx.insert(columnNotifyUsers).values(ids.map((userId) => ({ columnId: id, userId })));
    }
  });
  const row = first(await db.select().from(columns).where(eq(columns.id, id)))!;
  return (await withColumnNotify(db, [row]))[0]!;
}

export async function deleteColumn(db: Db, id: number) {
  const row = first(await db.delete(columns).where(eq(columns.id, id)).returning({ boardId: columns.boardId }));
  if (!row) throw new NotFoundError('column not found');
  return row.boardId;
}

export class MemberError extends Error {
  status = 400;
}

export function listMembers(db: Db, boardId: number) {
  return db
    .select({ id: users.id, username: users.username, color: users.color, role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId))
    .orderBy(asc(users.username));
}

async function ownerCount(db: Db, boardId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, 'owner')));
  return row!.n;
}

/** Добавить участника или сменить ему роль. На доске всегда остаётся хотя бы один owner. */
export async function setMemberRole(db: Db, boardId: number, userId: number, role: BoardRole) {
  const target = first(await db.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.id, userId)));
  if (!target) throw new NotFoundError('user not found');
  const current = first(
    await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))),
  );
  if (current?.role === 'owner' && role !== 'owner' && (await ownerCount(db, boardId)) <= 1) {
    throw new MemberError('на доске должен остаться хотя бы один владелец');
  }
  await db
    .insert(boardMembers)
    .values({ boardId, userId, role })
    .onConflictDoUpdate({ target: [boardMembers.boardId, boardMembers.userId], set: { role } });
}

export async function removeMember(db: Db, boardId: number, userId: number) {
  const current = first(
    await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))),
  );
  if (!current) throw new NotFoundError('member not found');
  if (current.role === 'owner' && (await ownerCount(db, boardId)) <= 1) {
    throw new MemberError('на доске должен остаться хотя бы один владелец');
  }
  await db.delete(boardMembers).where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)));
  await db
    .delete(columnNotifyUsers)
    .where(
      and(
        eq(columnNotifyUsers.userId, userId),
        inArray(columnNotifyUsers.columnId, db.select({ id: columns.id }).from(columns).where(eq(columns.boardId, boardId))),
      ),
    );
  // снимаем исполнителя с его задач на этой доске: у него больше нет доступа
  await db
    .delete(taskAssignees)
    .where(
      and(
        eq(taskAssignees.userId, userId),
        inArray(taskAssignees.taskId, db.select({ id: tasks.id }).from(tasks).where(eq(tasks.boardId, boardId))),
      ),
    );
}
