import { z } from 'zod';

export const telegramStatusSchema = z.object({
  /** бот настроен на сервере (задан токен) */
  enabled: z.boolean(),
  botUsername: z.string().nullable(),
  /** у текущего пользователя привязан чат */
  linked: z.boolean(),
});
export type TelegramStatus = z.infer<typeof telegramStatusSchema>;

export const telegramLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type TelegramLink = z.infer<typeof telegramLinkSchema>;

export const TELEGRAM_LINK_TTL_MIN = 10;
