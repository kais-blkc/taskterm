import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { TELEGRAM_LINK_TTL_MIN, isAdminRole } from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
import { boardMembers, telegramLinkCodes, users } from '../../db/schema';
import { randomToken, sha256 } from '../auth/password';

/** Новый код привязки; прежние неиспользованные коды пользователя гасятся. Код виден один раз. */
export async function createLinkCode(db: Db, userId: number) {
  const code = randomToken();
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MIN * 60_000).toISOString();
  await db.transaction(async (tx) => {
    await tx.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
    await tx.insert(telegramLinkCodes).values({ userId, codeHash: sha256(code), expiresAt });
  });
  return { code, expiresAt };
}

/**
 * Привязка по коду из бота. Код расходуется атомарно; чат, который был привязан к другому аккаунту,
 * переезжает на этот (один чат — один аккаунт). Возвращает имя пользователя или null.
 */
export async function claimLinkCode(db: Db, code: string, chatId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const claimed = first(
      await tx
        .delete(telegramLinkCodes)
        .where(and(eq(telegramLinkCodes.codeHash, sha256(code)), gt(telegramLinkCodes.expiresAt, new Date().toISOString())))
        .returning({ userId: telegramLinkCodes.userId }),
    );
    if (!claimed) return null;
    const user = first(await tx.select().from(users).where(eq(users.id, claimed.userId)));
    if (!user || !user.isActive) return null;
    await tx.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await tx.update(users).set({ telegramChatId: chatId }).where(eq(users.id, user.id));
    return user.username;
  });
}

export async function unlinkUser(db: Db, userId: number) {
  await db.update(users).set({ telegramChatId: null }).where(eq(users.id, userId));
  await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId));
}

/** Отвязка по чату (команда /stop, блокировка бота). Возвращает имя отвязанного пользователя. */
export async function unlinkChat(db: Db, chatId: string): Promise<string | null> {
  const row = first(await db.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId)).returning({ username: users.username }));
  return row?.username ?? null;
}

export async function isLinked(db: Db, userId: number) {
  const row = first(await db.select({ c: users.telegramChatId }).from(users).where(eq(users.id, userId)));
  return !!row?.c;
}

/**
 * Кому из получателей можно отправить уведомление: привязан чат, аккаунт активен
 * и (админ или участник доски) — убранный с доски ничего не получит.
 */
export async function deliverableChats(db: Db, userIds: number[], boardId: number) {
  if (!userIds.length) return [];
  const rows = await db
    .select({ id: users.id, role: users.role, chatId: users.telegramChatId })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.isActive, true), isNotNull(users.telegramChatId)));
  const members = new Set(
    (await db.select({ id: boardMembers.userId }).from(boardMembers).where(and(eq(boardMembers.boardId, boardId), inArray(boardMembers.userId, userIds)))).map((m) => m.id),
  );
  return rows.filter((r) => isAdminRole(r.role) || members.has(r.id)).map((r) => ({ userId: r.id, chatId: r.chatId! }));
}

/** Сервис для роутов, привязанный к БД: `const svc = createTelegramService(db)` */
/** Сводки общего чата в Telegram: включено ли у пользователя */
export async function chatNotifyOf(db: Db, userId: number): Promise<boolean> {
  const row = first(await db.select({ on: users.notifyChatTelegram }).from(users).where(eq(users.id, userId)));
  return row?.on ?? true;
}

export async function setChatNotify(db: Db, userId: number, enabled: boolean): Promise<boolean> {
  await db.update(users).set({ notifyChatTelegram: enabled }).where(eq(users.id, userId));
  return enabled;
}

export const createTelegramService = (db: Db) => bindDb(db, { createLinkCode, isLinked, unlinkUser, chatNotifyOf, setChatNotify });
