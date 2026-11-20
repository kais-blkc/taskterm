import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { appSettings } from '../../db/schema';

/** Хранилище настроек приложения (`app_settings`, ключ → текст). Единое место чтения/записи для notify, time, chat */

export async function getSetting(db: Db, key: string): Promise<string | undefined> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value;
}

/** Несколько ключей одним запросом; отсутствующих в карте нет */
export async function getSettings(db: Db, keys: string[]): Promise<Map<string, string>> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
