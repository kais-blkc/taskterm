import { asc, eq, sql } from 'drizzle-orm';
import { MAX_ATTACHMENTS, type ServerEvent } from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
import { taskAttachments, tasks } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { NotFoundError, requireTaskCan } from '../permissions/access';

export class AttachmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 = 400,
  ) {
    super(message);
  }
}

const cols = {
  id: taskAttachments.id,
  taskId: taskAttachments.taskId,
  name: taskAttachments.name,
  mime: taskAttachments.mime,
  size: taskAttachments.size,
  uploadedBy: taskAttachments.uploadedBy,
  createdAt: taskAttachments.createdAt,
};

const changed = (boardId: number, taskId: number, by: number): ServerEvent => ({ type: 'attachments', boardId, taskId, by });

/** Ключи файлов задач, которые вот-вот исчезнут вместе с задачей / доской / колонкой — чтобы стереть их с диска */
export async function attachmentKeys(db: Db, scope: { taskId: number } | { boardId: number } | { columnId: number }): Promise<string[]> {
  const base = db.select({ key: taskAttachments.storageKey }).from(taskAttachments);
  const rows =
    'taskId' in scope
      ? await base.where(eq(taskAttachments.taskId, scope.taskId))
      : 'boardId' in scope
        ? await base.innerJoin(tasks, eq(tasks.id, taskAttachments.taskId)).where(eq(tasks.boardId, scope.boardId))
        : await base.innerJoin(tasks, eq(tasks.id, taskAttachments.taskId)).where(eq(tasks.columnId, scope.columnId));
  return rows.map((r) => r.key);
}

/** Сколько файлов у задач доски (только где они есть) — для значка на карточках */
export async function attachmentStats(db: Db, boardId: number) {
  return db
    .select({ taskId: taskAttachments.taskId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(taskAttachments)
    .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
    .where(eq(tasks.boardId, boardId))
    .groupBy(taskAttachments.taskId);
}

async function countOf(db: Db, taskId: number) {
  const row = first(await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(taskAttachments).where(eq(taskAttachments.taskId, taskId)));
  return row?.n ?? 0;
}

// ─── Сценарии ──────────────────────────────────────────────────────────────

export async function listAttachments(db: Db, user: AuthUser, taskId: number) {
  await requireTaskCan(db, user, taskId, 'view');
  return db.select(cols).from(taskAttachments).where(eq(taskAttachments.taskId, taskId)).orderBy(asc(taskAttachments.id));
}

/** Можно ли добавлять: права + свободное место. Вызывается ДО приёма файла, чтобы не писать лишнее на диск */
export async function assertCanAdd(db: Db, user: AuthUser, taskId: number) {
  await requireTaskCan(db, user, taskId, 'editTask');
  if ((await countOf(db, taskId)) >= MAX_ATTACHMENTS) throw new AttachmentError(`к задаче можно прикрепить не больше ${MAX_ATTACHMENTS} файлов`, 409);
}

/** Запись о файле, уже лежащем на диске. Лимит перепроверяется под блокировкой задачи (две загрузки одновременно). */
export async function addAttachment(
  db: Db,
  user: AuthUser,
  taskId: number,
  file: { key: string; name: string; mime: string; size: number },
) {
  const { task } = await requireTaskCan(db, user, taskId, 'editTask');
  const row = await db.transaction(async (tx) => {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).for('update');
    if ((await countOf(tx, taskId)) >= MAX_ATTACHMENTS) throw new AttachmentError(`к задаче можно прикрепить не больше ${MAX_ATTACHMENTS} файлов`, 409);
    const [r] = await tx
      .insert(taskAttachments)
      .values({ taskId, name: file.name, mime: file.mime, size: file.size, storageKey: file.key, uploadedBy: user.id })
      .returning(cols);
    return r!;
  });
  return { attachment: row, events: [changed(task.boardId, taskId, user.id)] };
}

/** Метаданные + ключ для отдачи файла (право просмотра задачи) */
export async function getAttachmentFile(db: Db, user: AuthUser, id: number) {
  const row = first(await db.select().from(taskAttachments).where(eq(taskAttachments.id, id)));
  if (!row) throw new NotFoundError('файл не найден');
  await requireTaskCan(db, user, row.taskId, 'view');
  return row;
}

export async function deleteAttachment(db: Db, user: AuthUser, id: number) {
  const row = first(await db.select().from(taskAttachments).where(eq(taskAttachments.id, id)));
  if (!row) throw new NotFoundError('файл не найден');
  const { task } = await requireTaskCan(db, user, row.taskId, 'editTask');
  await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
  return { events: [changed(task.boardId, row.taskId, user.id)], files: [row.storageKey] };
}

/** Сервис, привязанный к БД */
export const createAttachmentService = (db: Db) =>
  bindDb(db, { listAttachments, assertCanAdd, addAttachment, getAttachmentFile, deleteAttachment });

