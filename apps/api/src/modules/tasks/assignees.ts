import { asc, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { taskAssignees } from '../../db/schema';

/** Добавляет к строкам задач `assigneeIds` (в порядке назначения) одним запросом */
export async function withAssignees<T extends { id: number }>(db: Db, rows: T[]): Promise<(T & { assigneeIds: number[] })[]> {
  if (!rows.length) return [];
  const links = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, rows.map((r) => r.id)))
    .orderBy(asc(taskAssignees.createdAt), asc(taskAssignees.userId));
  const byTask = new Map<number, number[]>();
  for (const l of links) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l.userId]);
  return rows.map((r) => ({ ...r, assigneeIds: byTask.get(r.id) ?? [] }));
}

export async function withAssignee<T extends { id: number }>(db: Db, row: T) {
  return (await withAssignees(db, [row]))[0]!;
}
