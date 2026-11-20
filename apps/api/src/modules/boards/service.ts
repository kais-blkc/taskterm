import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { defaultColumnNames, isAdminRole, roleCan, type BoardRole, type ServerEvent } from '@taskterm/shared';
import { bindDb, byId, first, type Db } from '../../db/client';
import { boardMembers, boards, columnNotifyUsers, columns, subtasks, taskAssignees, tasks, users } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { attachmentKeys, attachmentStats } from '../attachments/service';
import { audit } from '../audit/service';
import { ForbiddenError, NotFoundError, requireBoardCan, requireColumnCan } from '../permissions/access';
import { withAssignees } from '../tasks/assignees';
import { withColumnNotify } from './column-notify';

export { NotFoundError };

/** Доска + роль пользователя + может ли он ею управлять (с учётом защиты админом) */
export function withAccess<B extends { managedByAdmin: boolean }>(board: B, myRole: BoardRole, isAdmin: boolean) {
  return { ...board, myRole, canManage: roleCan(myRole, 'manageBoard') && (isAdmin || !board.managedByAdmin) };
}

/** Доски, доступные пользователю, с его ролью. Админ приложения видит все как owner. */
export async function listBoards(db: Db, user: AuthUser) {
  if (isAdminRole(user.role)) {
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
export function createBoardRow(db: Db, name: string, userId: number, isAdmin = false) {
  return db.transaction(async (tx) => {
    const [board] = await tx.insert(boards).values({ name, createdBy: userId, managedByAdmin: isAdmin }).returning();
    await tx.insert(boardMembers).values({ boardId: board!.id, userId, role: 'owner' });
    let prev: string | null = null;
    for (const [i, colName] of defaultColumnNames.entries()) {
      prev = generateKeyBetween(prev, null);
      // последняя из стандартных («Сделано») — «выполнено»; дальше админ может выбрать другую
      await tx.insert(columns).values({ boardId: board!.id, name: colName, position: prev, isDone: i === defaultColumnNames.length - 1 });
    }
    return withAccess(board!, 'owner', isAdmin);
  });
}

async function updateBoardRow(db: Db, id: number, name: string, myRole: BoardRole, isAdmin: boolean) {
  const row = first(await db.update(boards).set({ name }).where(eq(boards.id, id)).returning());
  if (!row) throw new NotFoundError('доска не найдена');
  return withAccess(row, myRole, isAdmin);
}

async function deleteBoardRow(db: Db, id: number) {
  const rows = await db.delete(boards).where(eq(boards.id, id)).returning({ id: boards.id });
  if (!rows.length) throw new NotFoundError('доска не найдена');
}

/** Счётчики подзадач по задачам доски + сколько из них на каком исполнителе (для сводки на карточке) */
async function subtaskStats(db: Db, boardId: number) {
  const totals = await db
    .select({
      taskId: subtasks.taskId,
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(*) filter (where ${subtasks.done})`.mapWith(Number),
    })
    .from(subtasks)
    .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
    .where(eq(tasks.boardId, boardId))
    .groupBy(subtasks.taskId);
  const people = await db
    .select({
      taskId: subtasks.taskId,
      userId: sql<number>`${subtasks.assigneeId}`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
      done: sql<number>`count(*) filter (where ${subtasks.done})`.mapWith(Number),
    })
    .from(subtasks)
    .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
    .where(and(eq(tasks.boardId, boardId), isNotNull(subtasks.assigneeId)))
    .groupBy(subtasks.taskId, subtasks.assigneeId)
    .orderBy(asc(subtasks.taskId), asc(subtasks.assigneeId));
  return totals.map((t) => ({
    ...t,
    assignees: people.filter((p) => p.taskId === t.taskId).map(({ userId, total, done }) => ({ userId, total, done })),
  }));
}

async function getBoardFullRow(db: Db, id: number, myRole: BoardRole, isAdmin: boolean) {
  const board = await byId(db, boards, id, 'board');
  return {
    board: withAccess(board, myRole, isAdmin),
    columns: await withColumnNotify(db, await db.select().from(columns).where(eq(columns.boardId, id)).orderBy(asc(columns.position))),
    tasks: await withAssignees(db, await db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(asc(tasks.position))),
    subtaskStats: await subtaskStats(db, id),
    attachmentStats: await attachmentStats(db, id),
  };
}

async function createColumnRow(db: Db, boardId: number, name: string) {
  const board = first(await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)));
  if (!board) throw new NotFoundError('доска не найдена');
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

async function updateColumnRow(
  db: Db,
  id: number,
  patch: { name?: string; notifyOnEnter?: boolean; notifyUserIds?: number[]; isDone?: boolean },
) {
  const col = await byId(db, columns, id, 'column');
  const ids = patch.notifyUserIds ? [...new Set(patch.notifyUserIds)] : undefined;
  if (ids?.length) {
    // получатели — только участники этой доски
    const members = await db
      .select({ userId: boardMembers.userId })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, col.boardId), inArray(boardMembers.userId, ids)));
    if (members.length !== ids.length) throw new ColumnError('получатель должен быть участником доски');
  }
  const fields = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.notifyOnEnter !== undefined ? { notifyOnEnter: patch.notifyOnEnter } : {}),
    ...(patch.isDone !== undefined ? { isDone: patch.isDone } : {}),
  };
  await db.transaction(async (tx) => {
    // «выполнено» одна на доске: отметили эту — с остальных снимаем
    if (patch.isDone) await tx.update(columns).set({ isDone: false }).where(and(eq(columns.boardId, col.boardId), ne(columns.id, id)));
    if (Object.keys(fields).length) await tx.update(columns).set(fields).where(eq(columns.id, id));
    if (ids) {
      await tx.delete(columnNotifyUsers).where(eq(columnNotifyUsers.columnId, id));
      if (ids.length) await tx.insert(columnNotifyUsers).values(ids.map((userId) => ({ columnId: id, userId })));
    }
  });
  const row = await byId(db, columns, id, 'column');
  return (await withColumnNotify(db, [row]))[0]!;
}

/** Порядок колонок: ставит колонку перед `beforeId` (null — в конец), позицию считает сервер (дробный индекс) */
async function moveColumnRow(db: Db, id: number, beforeId: number | null) {
  return db.transaction(async (tx) => {
    const col = await byId(tx, columns, id, 'column');
    const siblings = await tx
      .select({ id: columns.id, position: columns.position })
      .from(columns)
      .where(and(eq(columns.boardId, col.boardId), ne(columns.id, id)))
      .orderBy(asc(columns.position));
    let idx = siblings.length;
    if (beforeId !== null) {
      idx = siblings.findIndex((s) => s.id === beforeId);
      if (idx === -1) throw new ColumnError('колонка не найдена на этой доске');
    }
    const position = generateKeyBetween(siblings[idx - 1]?.position ?? null, siblings[idx]?.position ?? null);
    await tx.update(columns).set({ position }).where(eq(columns.id, id));
    return (await withColumnNotify(tx, [await byId(tx, columns, id, 'column')]))[0]!;
  });
}

async function deleteColumnRow(db: Db, id: number) {
  const row = first(await db.delete(columns).where(eq(columns.id, id)).returning({ boardId: columns.boardId }));
  if (!row) throw new NotFoundError('колонка не найдена');
  return row.boardId;
}

export class MemberError extends Error {
  status = 400;
}

function listMembersRows(db: Db, boardId: number) {
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
async function setMemberRoleRow(db: Db, boardId: number, userId: number, role: BoardRole) {
  const target = first(await db.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.id, userId)));
  if (!target) throw new NotFoundError('пользователь не найден');
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

async function removeMemberRow(db: Db, boardId: number, userId: number) {
  const current = first(
    await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))),
  );
  if (!current) throw new NotFoundError('участник не найден');
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
  await db
    .update(subtasks)
    .set({ assigneeId: null })
    .where(
      and(
        eq(subtasks.assigneeId, userId),
        inArray(subtasks.taskId, db.select({ id: tasks.id }).from(tasks).where(eq(tasks.boardId, boardId))),
      ),
    );
}

// ─── Сценарии (use cases): права → изменение → журнал → события; шину отдаёт роут ──────

const isAdmin = (u: AuthUser) => isAdminRole(u.role);
const boardsChanged = (by: number): ServerEvent => ({ type: 'boards', by });
const boardChanged = (boardId: number, by: number): ServerEvent => ({ type: 'board', boardId, by });
const membersChanged = (boardId: number, by: number): ServerEvent => ({ type: 'members', boardId, by });

export async function createBoard(db: Db, user: AuthUser, name: string) {
  const board = await createBoardRow(db, name, user.id, isAdmin(user));
  return { board, events: [boardsChanged(user.id)] };
}

export async function getBoard(db: Db, user: AuthUser, id: number) {
  const role = await requireBoardCan(db, user, id, 'view');
  return getBoardFullRow(db, id, role, isAdmin(user));
}

export async function updateBoard(db: Db, user: AuthUser, id: number, name: string) {
  const role = await requireBoardCan(db, user, id, 'manageBoard');
  const board = await updateBoardRow(db, id, name, role, isAdmin(user));
  return { board, events: [boardsChanged(user.id), boardChanged(board.id, user.id)] };
}

export async function deleteBoard(db: Db, user: AuthUser, id: number) {
  await requireBoardCan(db, user, id, 'manageBoard');
  const files = await attachmentKeys(db, { boardId: id }); // файлы убирает роут: БД удалит только записи
  await deleteBoardRow(db, id);
  await audit(db, user, 'board.delete', `board:${id}`);
  return { events: [boardsChanged(user.id)], files };
}

export async function createColumn(db: Db, user: AuthUser, boardId: number, name: string) {
  await requireBoardCan(db, user, boardId, 'manageBoard');
  const column = await createColumnRow(db, boardId, name);
  return { column, events: [boardChanged(column.boardId, user.id)] };
}

export async function updateColumn(
  db: Db,
  user: AuthUser,
  id: number,
  patch: { name?: string; notifyOnEnter?: boolean; notifyUserIds?: number[]; isDone?: boolean },
) {
  await requireColumnCan(db, user, id, 'manageBoard');
  // уведомления колонки настраивает только админ приложения
  if ((patch.notifyOnEnter !== undefined || patch.notifyUserIds !== undefined) && !isAdmin(user)) {
    throw new ForbiddenError('уведомления колонки меняют только администраторы');
  }
  // какая колонка «выполнено» — решает админ приложения
  if (patch.isDone !== undefined && !isAdmin(user)) {
    throw new ForbiddenError('колонку «выполнено» выбирают только администраторы');
  }
  const column = await updateColumnRow(db, id, patch);
  return { column, events: [boardChanged(column.boardId, user.id)] };
}

export async function moveColumn(db: Db, user: AuthUser, id: number, beforeId: number | null) {
  await requireColumnCan(db, user, id, 'manageBoard');
  const column = await moveColumnRow(db, id, beforeId);
  return { column, events: [boardChanged(column.boardId, user.id)] };
}

export async function deleteColumn(db: Db, user: AuthUser, id: number) {
  await requireColumnCan(db, user, id, 'manageBoard');
  const files = await attachmentKeys(db, { columnId: id });
  const boardId = await deleteColumnRow(db, id);
  return { events: [boardChanged(boardId, user.id)], files };
}

export async function listMembers(db: Db, user: AuthUser, boardId: number) {
  await requireBoardCan(db, user, boardId, 'view');
  return listMembersRows(db, boardId);
}

/** Добавить участника или сменить роль; возвращает обновлённый список */
export async function setMemberRole(db: Db, user: AuthUser, boardId: number, userId: number, role: BoardRole) {
  await requireBoardCan(db, user, boardId, 'manageBoard');
  await setMemberRoleRow(db, boardId, userId, role);
  await audit(db, user, 'board.member', `board:${boardId}`, { userId, role });
  return { members: await listMembersRows(db, boardId), events: [membersChanged(boardId, user.id)] };
}

export async function removeMember(db: Db, user: AuthUser, boardId: number, userId: number) {
  // выйти с доски может сам участник; убрать другого — только владелец
  await requireBoardCan(db, user, boardId, userId !== user.id ? 'manageBoard' : 'view');
  await removeMemberRow(db, boardId, userId);
  await audit(db, user, 'board.member_remove', `board:${boardId}`, { userId });
  return { events: [membersChanged(boardId, user.id), boardChanged(boardId, user.id)] };
}

/** Сервис, привязанный к БД: `const svc = createBoardService(db)` */
export const createBoardService = (db: Db) =>
  bindDb(db, {
    listBoards,
    createBoard,
    getBoard,
    updateBoard,
    deleteBoard,
    createColumn,
    updateColumn,
    moveColumn,
    deleteColumn,
    listMembers,
    setMemberRole,
    removeMember,
  });
