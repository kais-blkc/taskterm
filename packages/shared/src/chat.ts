import { z } from 'zod';
import { isAdminRole, type GlobalRole } from './auth';

/** Максимальная длина одного сообщения чата, знаков */
export const CHAT_MAX_LENGTH = 2000;
/** Сколько сообщений отдаёт история за один запрос */
export const CHAT_PAGE_SIZE = 50;

/** Название темы (вкладки) чата; эмодзи в начале — на усмотрение админа */
export const chatRoomNameSchema = z.string().trim().min(1).max(40);
/** Сколько тем можно создать */
export const CHAT_MAX_ROOMS = 30;

/** Тема чата — вкладка, как в группе Telegram. «Все» — не тема, а общая лента всех тем */
export const chatRoomSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** основная тема (General): закреплена, не удаляется, сюда пишем по умолчанию */
  isGeneral: z.boolean(),
  /** сколько чужих сообщений не прочитано именно у меня */
  unread: z.number().int(),
  /** у меня тема «без звука»: нет звука, браузерных уведомлений и Telegram (счётчик остаётся) */
  muted: z.boolean(),
});
export type ChatRoom = z.infer<typeof chatRoomSchema>;

export const chatMessageSchema = z.object({
  id: z.number().int(),
  roomId: z.number().int(),
  /** null — автора удалили */
  authorId: z.number().int().nullable(),
  text: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatTextSchema = z.string().trim().min(1).max(CHAT_MAX_LENGTH);

// ── Кадры WebSocket (`/api/chat/ws`). События сервера — те же, что в шине `ServerEvent` (events.ts) ──

/** клиент → сервер */
export const chatClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send'), roomId: z.number().int(), text: chatTextSchema }),
  /** прочитано всё в теме (без roomId — во всех темах) на сейчас */
  z.object({ type: z.literal('read'), roomId: z.number().int().optional() }),
]);
export type ChatClientFrame = z.infer<typeof chatClientFrameSchema>;

/** сервер → клиент: служебные кадры (сообщения и удаления приходят как события шины) */
export const chatControlFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);
export type ChatControlFrame = z.infer<typeof chatControlFrameSchema>;

// ── Общие настройки чата (меняет админ) ──

/** off — никто не удаляет; own — автор свои; admin — автор свои и администраторы любые */
export const chatDeleteModeSchema = z.enum(['off', 'own', 'admin']);
export type ChatDeleteMode = z.infer<typeof chatDeleteModeSchema>;
export const CHAT_DELETE_MODE_LABELS: Record<ChatDeleteMode, string> = {
  off: 'никто не удаляет',
  own: 'автор — свои',
  admin: 'автор — свои, админ — любые',
};

export const chatSettingsSchema = z.object({
  /** хранить сообщения N дней, потом удалять; 0 — бессрочно */
  retentionDays: z.number().int().min(0).max(3650),
  deleteMode: chatDeleteModeSchema,
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export const DEFAULT_CHAT_SETTINGS: ChatSettings = { retentionDays: 0, deleteMode: 'own' };

/** Можно ли удалить сообщение: единое правило и для сервера, и для кнопок в интерфейсе */
export function canDeleteChatMessage(settings: Pick<ChatSettings, 'deleteMode'>, user: { id: number; role: GlobalRole }, message: Pick<ChatMessage, 'authorId'>): boolean {
  if (settings.deleteMode === 'off') return false;
  if (message.authorId === user.id) return true;
  return settings.deleteMode === 'admin' && isAdminRole(user.role);
}

/** Правила чата для интерфейса (кто что удаляет) */
export const chatStateSchema = z.object({ deleteMode: chatDeleteModeSchema });
export type ChatState = z.infer<typeof chatStateSchema>;
