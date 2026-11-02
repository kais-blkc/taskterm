import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { MoveTaskInput } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { boardMembers, boards, columns, tasks } from '../../db/schema';
import { NotFoundError } from '../boards/service';

export class BadRequestError extends Error {
  status = 400;
}

export async function getTask(db: Db, id: number) {
  const row = first(await db.select().from(tasks).where(eq(tasks.id, id)));
  if (!row) throw new NotFoundError('task not found');
  return row;
}

export function createTask(
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
    if (!taken) throw new NotFoundError('board not found');
    const col = first(await tx.select().from(columns).where(eq(columns.id, input.columnId)));
    if (!col || col.boardId !== boardId) throw new BadRequestError('column does not belong to board');

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
    return row!;
  });
}

export async function updateTask(
  db: Db,
  id: number,
  patch: { title?: string; description?: string; assigneeId?: number | null; dueDate?: string | null },
) {
  const task = await getTask(db, id);
  if (patch.assigneeId) {
    // исполнитель — только участник доски
    const member = first(
      await db
        .select({ userId: boardMembers.userId })
        .from(boardMembers)
        .where(and(eq(boardMembers.boardId, task.boardId), eq(boardMembers.userId, patch.assigneeId))),
    );
    if (!member) throw new BadRequestError('assignee is not a board member');
  }
  const [row] = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .returning();
  return row!;
}

export async function deleteTask(db: Db, id: number) {
  const row = first(await db.delete(tasks).where(eq(tasks.id, id)).returning({ boardId: tasks.boardId }));
  if (!row) throw new NotFoundError('task not found');
  return row.boardId;
}

export function moveTask(db: Db, id: number, input: MoveTaskInput) {
  return db.transaction(async (tx) => {
    const task = await getTask(tx, id);
    const col = first(await tx.select().from(columns).where(eq(columns.id, input.columnId)));
    if (!col || col.boardId !== task.boardId) throw new BadRequestError('column does not belong to board');

    const siblings = await tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.columnId, col.id), ne(tasks.id, id)))
      .orderBy(asc(tasks.position));

    let idx = siblings.length;
    if (input.beforeId !== null) {
      idx = siblings.findIndex((s) => s.id === input.beforeId);
      if (idx === -1) throw new BadRequestError('beforeId is not in target column');
    }
    const position = generateKeyBetween(siblings[idx - 1]?.position ?? null, siblings[idx]?.position ?? null);
    const [row] = await tx.update(tasks).set({ columnId: col.id, position }).where(eq(tasks.id, id)).returning();
    return row!;
  });
}
