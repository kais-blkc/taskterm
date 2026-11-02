import { asc, eq } from 'drizzle-orm';
import { first, type Db } from '../../db/client';
import { subtasks } from '../../db/schema';
import { NotFoundError } from '../boards/service';
import { getTask } from '../tasks/service';

export async function getSubtask(db: Db, id: number) {
  const row = first(await db.select().from(subtasks).where(eq(subtasks.id, id)));
  if (!row) throw new NotFoundError('subtask not found');
  return row;
}

export async function listSubtasks(db: Db, taskId: number) {
  await getTask(db, taskId);
  return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.id));
}

export async function createSubtask(db: Db, taskId: number, title: string, userId: number) {
  const task = await getTask(db, taskId);
  const [row] = await db.insert(subtasks).values({ taskId, title, createdBy: userId }).returning();
  return { subtask: row!, boardId: task.boardId };
}

export async function createSubtasks(db: Db, taskId: number, items: { title: string; done?: boolean }[], userId: number) {
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

export async function updateSubtask(db: Db, id: number, patch: { title?: string; done?: boolean }) {
  const current = await getSubtask(db, id);
  const task = await getTask(db, current.taskId);
  const row = Object.keys(patch).length
    ? first(await db.update(subtasks).set(patch).where(eq(subtasks.id, id)).returning())!
    : current;
  return { subtask: row, boardId: task.boardId };
}

export async function deleteSubtask(db: Db, id: number) {
  const current = await getSubtask(db, id);
  const task = await getTask(db, current.taskId);
  await db.delete(subtasks).where(eq(subtasks.id, id));
  return { taskId: current.taskId, boardId: task.boardId };
}
