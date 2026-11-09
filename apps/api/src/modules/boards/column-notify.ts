import { and, eq, inArray } from 'drizzle-orm';
import { first, type Db } from '../../db/client';
import { boardMembers, columnNotifyUsers, columns } from '../../db/schema';

/** Добавляет к колонкам `notifyUserIds` одним запросом */
export async function withColumnNotify<T extends { id: number }>(db: Db, rows: T[]): Promise<(T & { notifyUserIds: number[] })[]> {
  if (!rows.length) return [];
  const links = await db
    .select()
    .from(columnNotifyUsers)
    .where(inArray(columnNotifyUsers.columnId, rows.map((r) => r.id)));
  return rows.map((r) => ({ ...r, notifyUserIds: links.filter((l) => l.columnId === r.id).map((l) => l.userId).sort((a, b) => a - b) }));
}

/** Кому и что слать при переносе задачи в колонку. null — уведомления выключены или слать некому. */
export async function columnMoveNotice(db: Db, columnId: number, exceptUserId: number) {
  const col = first(await db.select().from(columns).where(eq(columns.id, columnId)));
  if (!col || !col.notifyOnEnter) return null;
  // только те, кто всё ещё участник доски; сам переносящий не уведомляется
  const rows = await db
    .select({ userId: columnNotifyUsers.userId })
    .from(columnNotifyUsers)
    .innerJoin(
      boardMembers,
      and(eq(boardMembers.userId, columnNotifyUsers.userId), eq(boardMembers.boardId, col.boardId)),
    )
    .where(eq(columnNotifyUsers.columnId, columnId));
  const recipients = rows.map((r) => r.userId).filter((u) => u !== exceptUserId);
  return recipients.length ? { columnName: col.name, recipients } : null;
}
