import type { ServerEvent } from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { TelegramError, type TelegramApi, type TelegramUpdate } from './api';
import { claimLinkCode, deliverableChats, unlinkChat } from './service';

type NotifyEvent = Extract<ServerEvent, { type: 'notify' }>;
type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HELP =
  'Это бот уведомлений taskterm. Чтобы подключить аккаунт, откройте профиль в приложении (клик по своему имени) и нажмите «Подключить Telegram».\n\n/stop — отключить уведомления.';

export function formatNotification(e: NotifyEvent, publicUrl?: string): string {
  const head = `<b>#${e.taskNumber} ${escapeHtml(e.taskTitle)}</b>`;
  const body =
    e.kind === 'assigned'
      ? `Вас назначили ответственным (@${escapeHtml(e.authorName)}).`
      : `Новый комментарий от @${escapeHtml(e.authorName)}:\n${escapeHtml(e.snippet)}`;
  const link = publicUrl ? `\n${publicUrl}/b/${e.boardId}/t/${e.taskId}` : '';
  return `${head}\n${body}${link}`;
}

export function createTelegramBot(opts: { db: Db; api: TelegramApi; hub: EventHub; publicUrl?: string; log: Log }) {
  const { db, api, hub, publicUrl, log } = opts;
  let username: string | null = null;
  let stopped = false;
  const abort = new AbortController();
  let unsubscribe: (() => void) | null = null;
  let polling: Promise<void> | null = null;

  const reply = async (chatId: string, text: string) => {
    try {
      await api.sendMessage(chatId, escapeHtml(text));
    } catch (e) {
      log.warn(`telegram: reply failed: ${(e as Error).message}`);
    }
  };

  /** Сообщение от пользователя боту: только личные чаты */
  async function handleUpdate(update: TelegramUpdate) {
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== 'private') return;
    const chatId = String(msg.chat.id);
    const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
    if (cmd === '/start' && arg) {
      const name = await claimLinkCode(db, arg, chatId);
      await reply(
        chatId,
        name ? `Готово, аккаунт @${name} подключён. Сюда будут приходить комментарии и назначения.` : 'Код недействителен или просрочен. Получите новую ссылку в приложении.',
      );
    } else if (cmd === '/stop') {
      const name = await unlinkChat(db, chatId);
      await reply(chatId, name ? `Уведомления для @${name} отключены.` : 'Этот чат ни к какому аккаунту не подключён.');
    } else {
      await reply(chatId, HELP);
    }
  }

  /** Уведомление из шины событий → всем получателям с привязанным чатом и доступом к доске */
  async function notify(e: NotifyEvent) {
    const targets = await deliverableChats(db, e.recipients, e.boardId);
    const text = formatNotification(e, publicUrl);
    await Promise.all(
      targets.map(async (t) => {
        try {
          await api.sendMessage(t.chatId, text);
        } catch (err) {
          if (err instanceof TelegramError && err.chatGone) {
            await unlinkChat(db, t.chatId); // бот заблокирован — больше не пишем
          } else {
            log.warn(`telegram: send failed: ${(err as Error).message}`);
          }
        }
      }),
    );
  }

  async function pollLoop() {
    let offset = 0;
    let backoff = 1000;
    while (!stopped) {
      try {
        const updates = await api.getUpdates(offset, 25, abort.signal);
        backoff = 1000;
        for (const u of updates) {
          offset = u.update_id + 1;
          await handleUpdate(u).catch((e) => log.error(`telegram: update failed: ${(e as Error).message}`));
        }
      } catch (e) {
        if (stopped) return;
        // 409 — второй процесс опрашивает того же бота; ждём и пробуем снова
        log.warn(`telegram: polling error: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }

  return {
    handleUpdate,
    notify,
    /** username бота (кэшируется) */
    async getUsername() {
      username ??= (await api.getMe()).username;
      return username;
    },
    /** подписка на события и опрос Telegram */
    start() {
      unsubscribe = hub.subscribe((e) => {
        if (e.type === 'notify') void notify(e).catch((err) => log.error(`telegram: notify failed: ${(err as Error).message}`));
      });
      polling = pollLoop();
      log.info('telegram: bot started');
    },
    /** только подписка на события (без опроса) — для тестов */
    subscribeOnly() {
      unsubscribe = hub.subscribe((e) => {
        if (e.type === 'notify') void notify(e).catch(() => {});
      });
    },
    async stop() {
      stopped = true;
      abort.abort();
      unsubscribe?.();
      await polling?.catch(() => {});
    },
  };
}
export type TelegramBot = ReturnType<typeof createTelegramBot>;
