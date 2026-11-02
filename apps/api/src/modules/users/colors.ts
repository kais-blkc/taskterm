import { eq } from 'drizzle-orm';
import { pickDistinctColor } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';

export async function nextUserColor(db: Db): Promise<string> {
  const rows = await db.select({ color: users.color }).from(users);
  return pickDistinctColor(rows.map((u) => u.color).filter(Boolean));
}

/** Пользователям, созданным до появления цветов, выдаём цвета при старте */
export async function backfillUserColors(db: Db) {
  const missing = await db.select({ id: users.id }).from(users).where(eq(users.color, ''));
  for (const u of missing) {
    await db.update(users).set({ color: await nextUserColor(db) }).where(eq(users.id, u.id));
  }
}
