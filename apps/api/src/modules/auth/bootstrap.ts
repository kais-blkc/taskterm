import { eq } from 'drizzle-orm';
import type { Config } from '../../config';
import { first, type Db } from '../../db/client';
import { users } from '../../db/schema';
import { register } from './service';

/**
 * Владелец (главный админ). Если в БД нет владельца и задан ADMIN_USERNAME:
 * существующий пользователь с таким логином повышается до owner, иначе создаётся новый (нужен ADMIN_PASSWORD).
 */
export async function ensureAdmin(db: Db, config: Config, log: { info(m: string): void; warn(m: string): void }) {
  const hasOwner = first(await db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')));
  if (hasOwner) return;
  const { adminUsername: username, adminPassword: password, adminEmail: email } = config;
  if (!username) {
    log.warn('в БД нет админа: задай ADMIN_USERNAME (и ADMIN_PASSWORD для нового пользователя)');
    return;
  }
  const existing = first(await db.select().from(users).where(eq(users.username, username)));
  if (existing) {
    await db
      .update(users)
      .set({ role: 'owner', ...(email && !existing.email ? { email } : {}) })
      .where(eq(users.id, existing.id));
    log.info(`пользователь ${username} назначен владельцем`);
    return;
  }
  if (!password) {
    log.warn(`ADMIN_USERNAME=${username} не найден, а ADMIN_PASSWORD не задан — админ не создан`);
    return;
  }
  const row = await register(db, username, password, 'owner');
  if (email) await db.update(users).set({ email }).where(eq(users.id, row.id));
  log.info(`создан владелец (главный админ) ${username}`);
}
