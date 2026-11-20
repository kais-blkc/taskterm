import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { and, asc, count, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  CHAT_MAX_ROOMS,
  CHAT_PAGE_SIZE,
  canDeleteChatMessage,
  isAdminRole,
  type ChatMessage,
  type ChatRoom,
  type ChatState,
  type ServerEvent,
} from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
import { chatMessages, chatReads, chatRooms } from '../../db/schema';
import { audit } from '../audit/service';
import type { AuthUser } from '../auth/service';
import { ForbiddenError, NotFoundError } from '../permissions/access';
import { getChatSettings } from './settings';

export class ChatError extends Error {
  status = 400;
}


const cols = {
  id: chatMessages.id,
  roomId: chatMessages.roomId,
  authorId: chatMessages.authorId,
  text: chatMessages.text,
  createdAt: chatMessages.createdAt,
};

/** Основная тема (General): сюда пишем по умолчанию */
export async function generalRoomId(db: Db): Promise<number> {
  const row = first(await db.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.isGeneral, true)));
  if (!row) throw new Error('основная тема чата не создана (миграции 0019–0020)');
  return row.id;
}

const roomsChanged = (by: number): ServerEvent => ({ type: 'chat_rooms', by });

async function requireRoom(db: Db, id: number) {
  const room = first(await db.select().from(chatRooms).where(eq(chatRooms.id, id)));
  if (!room) throw new NotFoundError('тема не найдена');
  return room;
}

function requireAdmin(user: AuthUser) {
  if (!isAdminRole(user.role)) throw new ForbiddenError('темами чата управляют только администраторы');
}

// ─── Темы (вкладки) ───────────────────────────────────────────────────────

/** Не прочитанные чужие сообщения по темам для пользователя */
async function unreadByRoom(db: Db, userId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ roomId: chatMessages.roomId, n: count() })
    .from(chatMessages)
    .leftJoin(chatReads, and(eq(chatReads.roomId, chatMessages.roomId), eq(chatReads.userId, userId)))
    .where(and(sql`${chatMessages.id} > coalesce(${chatReads.lastReadId}, 0)`, or(isNull(chatMessages.authorId), ne(chatMessages.authorId, userId))))
    .groupBy(chatMessages.roomId);
  return new Map(rows.map((r) => [r.roomId, r.n]));
}

/** Все темы в порядке вкладок + у каждой мои «не прочитано» и «без звука» */
export async function listRooms(db: Db, user: AuthUser): Promise<ChatRoom[]> {
  const rows = await db
    .select({ id: chatRooms.id, name: chatRooms.name, isGeneral: chatRooms.isGeneral, muted: chatReads.muted })
    .from(chatRooms)
    .leftJoin(chatReads, and(eq(chatReads.roomId, chatRooms.id), eq(chatReads.userId, user.id)))
    .orderBy(asc(chatRooms.position), asc(chatRooms.id));
  const unread = await unreadByRoom(db, user.id);
  return rows.map((r) => ({ id: r.id, name: r.name, isGeneral: r.isGeneral, muted: r.muted ?? false, unread: unread.get(r.id) ?? 0 }));
}

export async function createRoom(db: Db, user: AuthUser, name: string) {
  requireAdmin(user);
  const all = await db.select({ position: chatRooms.position }).from(chatRooms).orderBy(asc(chatRooms.position));
  if (all.length >= CHAT_MAX_ROOMS) throw new ChatError(`тем не больше ${CHAT_MAX_ROOMS}`);
  const [row] = await db
    .insert(chatRooms)
    .values({ slug: `r-${randomUUID().slice(0, 8)}`, name, position: generateKeyBetween(all.at(-1)?.position ?? null, null) })
    .returning({ id: chatRooms.id });
  await audit(db, user, 'chat.room.create', `room:${row!.id}`, { name });
  return { id: row!.id, events: [roomsChanged(user.id)] };
}

export async function renameRoom(db: Db, user: AuthUser, id: number, name: string) {
  requireAdmin(user);
  const room = await requireRoom(db, id);
  await db.update(chatRooms).set({ name }).where(eq(chatRooms.id, id));
  await audit(db, user, 'chat.room.rename', `room:${id}`, { from: room.name, to: name });
  return { events: [roomsChanged(user.id)] };
}

/** Порядок вкладок: «перед beforeId» (null — в конец), дробный индекс как у колонок доски */
export async function moveRoom(db: Db, user: AuthUser, id: number, beforeId: number | null) {
  requireAdmin(user);
  await requireRoom(db, id);
  await db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: chatRooms.id, position: chatRooms.position })
      .from(chatRooms)
      .where(ne(chatRooms.id, id))
      .orderBy(asc(chatRooms.position), asc(chatRooms.id));
    let idx = siblings.length;
    if (beforeId !== null) {
      idx = siblings.findIndex((s) => s.id === beforeId);
      if (idx === -1) throw new ChatError('тема не найдена');
    }
    const position = generateKeyBetween(siblings[idx - 1]?.position ?? null, siblings[idx]?.position ?? null);
    await tx.update(chatRooms).set({ position }).where(eq(chatRooms.id, id));
  });
  return { events: [roomsChanged(user.id)] };
}

/** Удалить тему вместе с её сообщениями; основную (General) удалить нельзя */
export async function deleteRoom(db: Db, user: AuthUser, id: number) {
  requireAdmin(user);
  const room = await requireRoom(db, id);
  if (room.isGeneral) throw new ChatError('основную тему удалить нельзя');
  await db.delete(chatRooms).where(eq(chatRooms.id, id));
  await audit(db, user, 'chat.room.delete', `room:${id}`, { name: room.name });
  return { events: [roomsChanged(user.id)] };
}

/** «Без звука» для темы — личная настройка: звук, браузерные уведомления и Telegram молчат, счётчик остаётся */
export async function setMuted(db: Db, user: AuthUser, roomId: number, muted: boolean) {
  await requireRoom(db, roomId);
  await db
    .insert(chatReads)
    .values({ roomId, userId: user.id, muted })
    .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { muted } });
}

// ─── Сообщения ────────────────────────────────────────────────────────────
// Шину не трогают: возвращают `events`, их отдаёт роут/WebSocket.

/** Страница истории: сообщения темы (или всех тем, если roomId не задан) старше `before`, по возрастанию id; `hasMore` — есть ли старее */
export async function listMessages(db: Db, _user: AuthUser, q: { roomId?: number; before?: number; limit?: number } = {}) {
  const limit = Math.min(q.limit ?? CHAT_PAGE_SIZE, 200);
  const rows = await db
    .select(cols)
    .from(chatMessages)
    .where(and(q.roomId ? eq(chatMessages.roomId, q.roomId) : undefined, q.before ? lt(chatMessages.id, q.before) : undefined))
    .orderBy(desc(chatMessages.id))
    .limit(limit + 1);
  const messages: ChatMessage[] = rows.slice(0, limit).reverse();
  return { messages, hasMore: rows.length > limit };
}

export async function sendMessage(db: Db, user: AuthUser, roomId: number, text: string) {
  await requireRoom(db, roomId);
  const [row] = await db.insert(chatMessages).values({ roomId, authorId: user.id, text }).returning(cols);
  const message: ChatMessage = row!;
  const events: ServerEvent[] = [{ type: 'chat_message', message, by: user.id }];
  return { message, events };
}

/** Удаление по общей настройке чата (`canDeleteChatMessage` — то же правило, что у кнопок на клиенте) */
export async function deleteMessage(db: Db, user: AuthUser, id: number) {
  const message = first(await db.select(cols).from(chatMessages).where(eq(chatMessages.id, id)));
  if (!message) throw new NotFoundError('сообщение не найдено');
  const settings = await getChatSettings(db);
  if (!canDeleteChatMessage(settings, user, message)) throw new ForbiddenError('удалять это сообщение нельзя (настройки чата)');
  await db.delete(chatMessages).where(eq(chatMessages.id, id));
  const events: ServerEvent[] = [{ type: 'chat_deleted', id, by: user.id }];
  return { events };
}

/** Отметить прочитанным всё в теме (без roomId — во всех темах) на сейчас; назад не откатывается */
export async function markRead(db: Db, user: AuthUser, roomId?: number) {
  const latest = await db
    .select({ roomId: chatMessages.roomId, id: sql<number>`max(${chatMessages.id})`.mapWith(Number) })
    .from(chatMessages)
    .where(roomId ? eq(chatMessages.roomId, roomId) : undefined)
    .groupBy(chatMessages.roomId);
  for (const l of latest) {
    await db
      .insert(chatReads)
      .values({ roomId: l.roomId, userId: user.id, lastReadId: l.id })
      .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { lastReadId: sql`greatest(${chatReads.lastReadId}, ${l.id})` } });
  }
}

export async function chatState(db: Db, _user: AuthUser): Promise<ChatState> {
  return { deleteMode: (await getChatSettings(db)).deleteMode };
}

/** Срок хранения истёк — удаляем старые сообщения всех тем; 0 дней = хранить всегда. Возвращает, сколько удалено */
export async function cleanupExpired(db: Db): Promise<number> {
  const { retentionDays } = await getChatSettings(db);
  if (!retentionDays) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const gone = await db.delete(chatMessages).where(lt(chatMessages.createdAt, cutoff)).returning({ id: chatMessages.id });
  return gone.length;
}

/** Сервис, привязанный к БД: `const svc = createChatService(db)` */
export const createChatService = (db: Db) =>
  bindDb(db, { listRooms, createRoom, renameRoom, moveRoom, deleteRoom, setMuted, listMessages, sendMessage, deleteMessage, markRead, chatState, cleanupExpired });

