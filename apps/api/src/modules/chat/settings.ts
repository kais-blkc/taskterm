import { DEFAULT_CHAT_SETTINGS, chatDeleteModeSchema, type ChatSettings } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { getSettings, setSetting } from '../settings/store';

const RETENTION = 'chat.retentionDays';
const DELETE_MODE = 'chat.deleteMode';

/** Общие настройки чата (хранятся в app_settings); чего нет — берём значения по умолчанию */
export async function getChatSettings(db: Db): Promise<ChatSettings> {
  const map = await getSettings(db, [RETENTION, DELETE_MODE]);
  const days = Number(map.get(RETENTION));
  const mode = chatDeleteModeSchema.safeParse(map.get(DELETE_MODE));
  return {
    retentionDays: Number.isInteger(days) && days >= 0 ? days : DEFAULT_CHAT_SETTINGS.retentionDays,
    deleteMode: mode.success ? mode.data : DEFAULT_CHAT_SETTINGS.deleteMode,
  };
}

export async function saveChatSettings(db: Db, input: ChatSettings): Promise<ChatSettings> {
  await setSetting(db, RETENTION, String(input.retentionDays));
  await setSetting(db, DELETE_MODE, input.deleteMode);
  return getChatSettings(db);
}
