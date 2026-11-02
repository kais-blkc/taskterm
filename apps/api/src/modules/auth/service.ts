import { eq } from 'drizzle-orm';
import type { User } from '@taskterm/shared';
import type { Db } from '../../db/client';
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

function createSession(db: Db, userId: number) {
  const { token, id } = newSessionToken();
  db.insert(sessions)
    .values({ id, userId, expiresAt: Date.now() + SESSION_TTL_MS })
    .run();
  return token;
}

export async function register(db: Db, username: string, password: string) {
  const exists = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (exists) throw new AuthError('username already taken', 409);
  const passwordHash = await hashPassword(password);
  const row = db
    .insert(users)
    .values({ username, passwordHash, color: nextUserColor(db) })
    .returning()
    .get();
  return { user: { id: row.id, username: row.username, color: row.color } satisfies User, token: createSession(db, row.id) };
}

export async function login(db: Db, username: string, password: string) {
  const row = db.select().from(users).where(eq(users.username, username)).get();
  // одинаковая ошибка для неверного логина и пароля
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AuthError('invalid username or password', 401);
  }
  return { user: { id: row.id, username: row.username, color: row.color } satisfies User, token: createSession(db, row.id) };
}

export function userByToken(db: Db, token: string): User | null {
  const id = sha256(token);
  const row = db
    .select({ id: users.id, username: users.username, color: users.color, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  return { id: row.id, username: row.username, color: row.color };
}

export function destroySession(db: Db, token: string) {
  db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
}
