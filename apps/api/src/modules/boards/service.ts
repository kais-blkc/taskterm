import { asc, eq, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { defaultColumnNames } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { boards, columns, subtasks, tasks } from '../../db/schema';

export class NotFoundError extends Error {
  status = 404;
}

export function listBoards(db: Db) {
  return db.select().from(boards).orderBy(asc(boards.id)).all();
}

export function createBoard(db: Db, name: string, userId: number) {
  return db.transaction((tx) => {
    const board = tx.insert(boards).values({ name, createdBy: userId }).returning().get();
    let prev: string | null = null;
    for (const colName of defaultColumnNames) {
      prev = generateKeyBetween(prev, null);
      tx.insert(columns).values({ boardId: board.id, name: colName, position: prev }).run();
    }
    return board;
  });
}

export function updateBoard(db: Db, id: number, name: string) {
  const row = db.update(boards).set({ name }).where(eq(boards.id, id)).returning().get();
  if (!row) throw new NotFoundError('board not found');
  return row;
}

export function deleteBoard(db: Db, id: number) {
  const res = db.delete(boards).where(eq(boards.id, id)).run();
  if (!res.changes) throw new NotFoundError('board not found');
}

export function getBoardFull(db: Db, id: number) {
  const board = db.select().from(boards).where(eq(boards.id, id)).get();
  if (!board) throw new NotFoundError('board not found');
  return {
    board,
    columns: db.select().from(columns).where(eq(columns.boardId, id)).orderBy(asc(columns.position)).all(),
    tasks: db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(asc(tasks.position)).all(),
    subtaskStats: db
      .select({
        taskId: subtasks.taskId,
        total: sql<number>`count(*)`.mapWith(Number),
        done: sql<number>`coalesce(sum(${subtasks.done}), 0)`.mapWith(Number),
      })
      .from(subtasks)
      .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
      .where(eq(tasks.boardId, id))
      .groupBy(subtasks.taskId)
      .all(),
  };
}

export function createColumn(db: Db, boardId: number, name: string) {
  const board = db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)).get();
  if (!board) throw new NotFoundError('board not found');
  const last = db
    .select({ position: columns.position })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.position))
    .all()
    .at(-1);
  const position = generateKeyBetween(last?.position ?? null, null);
  return db.insert(columns).values({ boardId, name, position }).returning().get();
}

export function updateColumn(db: Db, id: number, name: string) {
  const row = db.update(columns).set({ name }).where(eq(columns.id, id)).returning().get();
  if (!row) throw new NotFoundError('column not found');
  return row;
}

export function deleteColumn(db: Db, id: number) {
  const row = db.delete(columns).where(eq(columns.id, id)).returning({ boardId: columns.boardId }).get();
  if (!row) throw new NotFoundError('column not found');
  return row.boardId;
}
