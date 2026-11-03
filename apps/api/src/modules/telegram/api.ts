/** Тонкий клиент Bot API: в тестах подменяется фейком (интерфейс TelegramApi). */
export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number; type: string }; text?: string };
}

export interface TelegramApi {
  getMe(): Promise<{ username: string }>;
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
  sendMessage(chatId: string, html: string): Promise<void>;
}

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** пользователь заблокировал бота / чат удалён — привязку нужно снять */
  get chatGone() {
    return this.status === 403 || (this.status === 400 && /chat not found/i.test(this.message));
  }
}

export function createTelegramApi(token: string): TelegramApi {
  const call = async <T>(method: string, body: object, signal?: AbortSignal): Promise<T> => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !data?.ok) throw new TelegramError(data?.description ?? res.statusText, res.status);
    return data.result as T;
  };
  return {
    getMe: () => call('getMe', {}),
    getUpdates: (offset, timeout, signal) =>
      call('getUpdates', { offset, timeout, allowed_updates: ['message'] }, signal),
    sendMessage: async (chatId, html) => {
      await call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
    },
  };
}
