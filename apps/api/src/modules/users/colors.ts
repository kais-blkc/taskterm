import { eq } from 'drizzle-orm';
import { pickDistinctColor } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';

export function nextUserColor(db: Db): string {
  const taken = db.select({ color: users.color }).from(users).all().map((u) => u.color).filter(Boolean);
  return pickDistinctColor(taken);
}

/** Пользователям, созданным до появления цветов, выдаём цвета при старте */
export function backfillUserColors(db: Db) {
  const missing = db.select({ id: users.id }).from(users).where(eq(users.color, '')).all();
  for (const u of missing) {
    db.update(users).set({ color: nextUserColor(db) }).where(eq(users.id, u.id)).run();
  }
}
