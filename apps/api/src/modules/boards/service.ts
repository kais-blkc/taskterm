import { asc, eq, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { defaultColumnNames } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { boards, columns, subtasks, tasks } from '../../db/schema';

export class NotFoundError extends Error {
  status = 404;
}

export function listBoards(db: Db) {
  return db.select().from(boards).orderBy(asc(boards.id));
}

export function createBoard(db: Db, name: string, userId: number) {
  return db.transaction(async (tx) => {
    const [board] = await tx.insert(boards).values({ name, createdBy: userId }).returning();
    let prev: string | null = null;
    for (const colName of defaultColumnNames) {
      prev = generateKeyBetween(prev, null);
      await tx.insert(columns).values({ boardId: board!.id, name: colName, position: prev });
    }
    return board!;
  });
}

export async function updateBoard(db: Db, id: number, name: string) {
  const row = first(await db.update(boards).set({ name }).where(eq(boards.id, id)).returning());
  if (!row) throw new NotFoundError('board not found');
  return row;
}

export async function deleteBoard(db: Db, id: number) {
  const rows = await db.delete(boards).where(eq(boards.id, id)).returning({ id: boards.id });
  if (!rows.length) throw new NotFoundError('board not found');
}

export async function getBoardFull(db: Db, id: number) {
  const board = first(await db.select().from(boards).where(eq(boards.id, id)));
  if (!board) throw new NotFoundError('board not found');
  return {
    board,
    columns: await db.select().from(columns).where(eq(columns.boardId, id)).orderBy(asc(columns.position)),
    tasks: await db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(asc(tasks.position)),
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
  return row!;
}

export async function updateColumn(db: Db, id: number, name: string) {
  const row = first(await db.update(columns).set({ name }).where(eq(columns.id, id)).returning());
  if (!row) throw new NotFoundError('column not found');
  return row;
}

export async function deleteColumn(db: Db, id: number) {
  const row = first(await db.delete(columns).where(eq(columns.id, id)).returning({ boardId: columns.boardId }));
  if (!row) throw new NotFoundError('column not found');
  return row.boardId;
}
