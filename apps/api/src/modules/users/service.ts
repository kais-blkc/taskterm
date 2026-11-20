import { asc, eq, ne } from 'drizzle-orm';
import { findSimilar } from '@taskterm/shared';
import { bindDb, type Db } from '../../db/client';
import { users } from '../../db/schema';

// password_hash наружу не отдаём
const cols = { id: users.id, username: users.username, color: users.color };

export class ColorClashError extends Error {
  status = 409;
}

/** Список для выбора исполнителя */
export function listUsers(db: Db) {
  return db.select(cols).from(users).orderBy(asc(users.username));
}

/** Смена своего цвета: отклоняется, если слишком похож на чужой (409) */
export async function setColor(db: Db, userId: number, rawColor: string) {
  const color = rawColor.toLowerCase();
  const others = await db.select(cols).from(users).where(ne(users.id, userId));
  const clash = findSimilar(color, others);
  if (clash) throw new ColorClashError(`слишком похож на цвет @${clash.username}`);
  const [row] = await db.update(users).set({ color }).where(eq(users.id, userId)).returning(cols);
  return row!;
}

/** Сервис, привязанный к БД: `const svc = createUserService(db)` */
export const createUserService = (db: Db) => bindDb(db, { listUsers, setColor });
