import { eq } from 'drizzle-orm';
import type { User } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { sessions, users } from '../../db/schema';
import { nextUserColor } from '../users/colors';
import { hashPassword, newSessionToken, sha256, verifyPassword } from './password';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function createSession(db: Db, userId: number) {
  const { token, id } = newSessionToken();
  await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
  return token;
}

export async function register(db: Db, username: string, password: string) {
  const exists = first(await db.select({ id: users.id }).from(users).where(eq(users.username, username)));
  if (exists) throw new AuthError('username already taken', 409);
  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash, color: await nextUserColor(db) })
    .returning();
  return { user: { id: row!.id, username: row!.username, color: row!.color } satisfies User, token: await createSession(db, row!.id) };
}

export async function login(db: Db, username: string, password: string) {
  const row = first(await db.select().from(users).where(eq(users.username, username)));
  // одинаковая ошибка для неверного логина и пароля
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AuthError('invalid username or password', 401);
  }
  return { user: { id: row.id, username: row.username, color: row.color } satisfies User, token: await createSession(db, row.id) };
}

export async function userByToken(db: Db, token: string): Promise<User | null> {
  const id = sha256(token);
  const row = first(
    await db
      .select({ id: users.id, username: users.username, color: users.color, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id)),
  );
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return { id: row.id, username: row.username, color: row.color };
}

export async function destroySession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}
