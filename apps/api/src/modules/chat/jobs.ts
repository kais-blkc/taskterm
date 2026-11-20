import { and, asc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { chatMessages, chatReads, chatRooms, users } from '../../db/schema';
import type { EventHub } from '../../plugins/hub';
import { escapeHtml, type TelegramBot } from '../telegram/bot';
import { cleanupExpired } from './service';

type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

const DAY_MS = 86_400_000;

/** Сколько сообщений показываем в сводке для Telegram */
const DIGEST_SHOWN = 3;

/**
 * Сводка по новым сообщениям чата в Telegram. Первое непрочитанное сообщение запускает таймер `windowMs`;
 * по его окончании каждому подключившему Telegram (и не выключившему чат) уходит одна сводка по всем темам, где он что-то не прочитал
 * (темы «без звука» пропускаются). Что уже вошло в сводку, помнится в `chat_reads.notified_id` — повторно то же не шлём.
 */
export async function sendChatDigest(db: Db, bot: Pick<TelegramBot, 'deliver'>, publicUrl?: string): Promise<number> {
  const recipients = await db
    .select({ id: users.id, chatId: users.telegramChatId })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.notifyChatTelegram, true), isNotNull(users.telegramChatId)));
  let sent = 0;
  for (const r of recipients) {
    // новые сообщения по темам: чужие, не прочитанные и не вошедшие в прошлую сводку, в темах не «без звука»
    const fresh = await db
      .select({ id: chatMessages.id, roomId: chatMessages.roomId, roomName: chatRooms.name, text: chatMessages.text, authorName: users.username })
      .from(chatMessages)
      .innerJoin(chatRooms, eq(chatRooms.id, chatMessages.roomId))
      .leftJoin(chatReads, and(eq(chatReads.roomId, chatMessages.roomId), eq(chatReads.userId, r.id)))
      .leftJoin(users, eq(users.id, chatMessages.authorId))
      .where(
        and(
          or(isNull(chatMessages.authorId), ne(chatMessages.authorId, r.id)),
          sql`${chatMessages.id} > greatest(coalesce(${chatReads.lastReadId}, 0), coalesce(${chatReads.notifiedId}, 0))`,
          sql`coalesce(${chatReads.muted}, false) = false`,
        ),
      )
      .orderBy(asc(chatMessages.id));
    if (!fresh.length) continue;

    const perRoom = new Map<string, number>();
    for (const m of fresh) perRoom.set(m.roomName, (perRoom.get(m.roomName) ?? 0) + 1);
    const authors = [...new Set(fresh.map((m) => `@${m.authorName ?? 'удалён'}`))];
    const lines = [
      `<b>Чат:</b> ${fresh.length} ${plural(fresh.length, ['новое сообщение', 'новых сообщения', 'новых сообщений'])} от ${escapeHtml(authors.slice(0, 5).join(', '))}${authors.length > 5 ? '…' : ''}`,
    ];
    if (perRoom.size > 1) lines.push([...perRoom].map(([name, n]) => `${escapeHtml(name)} — ${n}`).join(', '));
    for (const m of fresh.slice(-DIGEST_SHOWN)) {
      lines.push(`${perRoom.size > 1 ? `[${escapeHtml(m.roomName)}] ` : ''}${escapeHtml(`@${m.authorName ?? 'удалён'}`)}: ${escapeHtml(m.text.slice(0, 140))}`);
    }
    if (publicUrl) lines.push(`${publicUrl}/chat`);
    await bot.deliver(r.chatId!, lines.join('\n'));

    // запоминаем, до какого сообщения каждой темы уже сообщили
    const upTo = new Map<number, number>();
    for (const m of fresh) upTo.set(m.roomId, m.id);
    for (const [roomId, notifiedId] of upTo) {
      await db
        .insert(chatReads)
        .values({ roomId, userId: r.id, notifiedId })
        .onConflictDoUpdate({ target: [chatReads.roomId, chatReads.userId], set: { notifiedId } });
    }
    sent += 1;
  }
  return sent;
}

/** 1 новое сообщение / 2 новых сообщения / 5 новых сообщений */
function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/**
 * Фоновые задачи чата: сводки в Telegram (по таймеру после новых сообщений) и очистка по сроку хранения (раз в сутки и при старте).
 * Возвращает функцию остановки.
 */
export function startChatJobs(opts: { db: Db; hub: EventHub; bot: TelegramBot | null; publicUrl?: string; digestMs: number; log: Log }) {
  const { db, hub, bot, publicUrl, digestMs, log } = opts;
  let digestTimer: NodeJS.Timeout | null = null;

  const unsubscribe = hub.subscribe((e) => {
    if (e.type !== 'chat_message' || !bot || digestTimer) return;
    digestTimer = setTimeout(() => {
      digestTimer = null;
      sendChatDigest(db, bot, publicUrl).catch((err) => log.error(`chat: digest failed: ${(err as Error).message}`));
    }, digestMs);
  });

  const cleanup = () =>
    cleanupExpired(db)
      .then((n) => n && log.info(`chat: удалено устаревших сообщений: ${n}`))
      .catch((err) => log.error(`chat: cleanup failed: ${(err as Error).message}`));
  void cleanup();
  const cleanupTimer = setInterval(() => void cleanup(), DAY_MS);

  return () => {
    unsubscribe();
    if (digestTimer) clearTimeout(digestTimer);
    clearInterval(cleanupTimer);
  };
}
