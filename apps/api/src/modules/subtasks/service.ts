import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { subtasks } from '../../db/schema';
import { NotFoundError } from '../boards/service';
import { getTask } from '../tasks/service';

export function getSubtask(db: Db, id: number) {
  const row = db.select().from(subtasks).where(eq(subtasks.id, id)).get();
  if (!row) throw new NotFoundError('subtask not found');
  return row;
}

export function listSubtasks(db: Db, taskId: number) {
  getTask(db, taskId);
  return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.id)).all();
}

export function createSubtask(db: Db, taskId: number, title: string) {
  const task = getTask(db, taskId);
  const row = db.insert(subtasks).values({ taskId, title }).returning().get();
  return { subtask: row, boardId: task.boardId };
}

export function createSubtasks(db: Db, taskId: number, items: { title: string; done?: boolean }[]) {
  const task = getTask(db, taskId);
  const rows = db.transaction((tx) =>
    items.map((it) => tx.insert(subtasks).values({ taskId, title: it.title, done: it.done ?? false }).returning().get()),
  );
  return { subtasks: rows, boardId: task.boardId };
}

export function updateSubtask(db: Db, id: number, patch: { title?: string; done?: boolean }) {
  const current = getSubtask(db, id);
  const task = getTask(db, current.taskId);
  const row = Object.keys(patch).length
    ? db.update(subtasks).set(patch).where(eq(subtasks.id, id)).returning().get()
    : current;
  return { subtask: row, boardId: task.boardId };
}

export function deleteSubtask(db: Db, id: number) {
  const current = getSubtask(db, id);
  const task = getTask(db, current.taskId);
  db.delete(subtasks).where(eq(subtasks.id, id)).run();
  return { taskId: current.taskId, boardId: task.boardId };
}
