import { and, asc, eq, ne } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { MoveTaskInput } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { boards, columns, tasks, users } from '../../db/schema';
import { NotFoundError } from '../boards/service';

export class BadRequestError extends Error {
  status = 400;
}

export function getTask(db: Db, id: number) {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw new NotFoundError('task not found');
  return row;
}

export function createTask(
  db: Db,
  boardId: number,
  authorId: number,
  input: { columnId: number; title: string; description?: string; dueDate?: string },
) {
  return db.transaction((tx) => {
    const board = tx.select().from(boards).where(eq(boards.id, boardId)).get();
    if (!board) throw new NotFoundError('board not found');
    const col = tx.select().from(columns).where(eq(columns.id, input.columnId)).get();
    if (!col || col.boardId !== boardId) throw new BadRequestError('column does not belong to board');

    const last = tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(eq(tasks.columnId, col.id))
      .orderBy(asc(tasks.position))
      .all()
      .at(-1);

    tx.update(boards).set({ nextTaskNumber: board.nextTaskNumber + 1 }).where(eq(boards.id, boardId)).run();
    return tx
      .insert(tasks)
      .values({
        boardId,
        columnId: col.id,
        number: board.nextTaskNumber,
        title: input.title,
        description: input.description ?? '',
        dueDate: input.dueDate ?? null,
        position: generateKeyBetween(last?.position ?? null, null),
        authorId,
      })
      .returning()
      .get();
  });
}

export function updateTask(
  db: Db,
  id: number,
  patch: { title?: string; description?: string; assigneeId?: number | null; dueDate?: string | null },
) {
  getTask(db, id);
  if (patch.assigneeId) {
    const user = db.select({ id: users.id }).from(users).where(eq(users.id, patch.assigneeId)).get();
    if (!user) throw new BadRequestError('assignee not found');
  }
  return db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    .where(eq(tasks.id, id))
    .returning()
    .get();
}

export function deleteTask(db: Db, id: number) {
  const row = db.delete(tasks).where(eq(tasks.id, id)).returning({ boardId: tasks.boardId }).get();
  if (!row) throw new NotFoundError('task not found');
  return row.boardId;
}

export function moveTask(db: Db, id: number, input: MoveTaskInput) {
  return db.transaction((tx) => {
    const task = getTask(tx as unknown as Db, id);
    const col = tx.select().from(columns).where(eq(columns.id, input.columnId)).get();
    if (!col || col.boardId !== task.boardId) throw new BadRequestError('column does not belong to board');

    const siblings = tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.columnId, col.id), ne(tasks.id, id)))
      .orderBy(asc(tasks.position))
      .all();

    let idx = siblings.length;
    if (input.beforeId !== null) {
      idx = siblings.findIndex((s) => s.id === input.beforeId);
      if (idx === -1) throw new BadRequestError('beforeId is not in target column');
    }
    const position = generateKeyBetween(siblings[idx - 1]?.position ?? null, siblings[idx]?.position ?? null);
    return tx
      .update(tasks)
      .set({ columnId: col.id, position })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  });
}
