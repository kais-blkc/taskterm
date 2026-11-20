import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { GlobalRole, Me } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { refreshTokens, users } from '../../db/schema';
import { nextUserColor } from '../users/colors';
import { hashPassword, randomToken, sha256, verifyPassword } from './password';
import { REFRESH_TTL_MS, signAccess, verifyAccess } from './tokens';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Окно, в котором повторное предъявление уже ротированного refresh — гонка вкладок, а не кража */
export const ROTATION_GRACE_MS = 10_000;

export type AuthUser = Me;

type UserRow = typeof users.$inferSelect;

export const toAuthUser = (r: Pick<UserRow, 'id' | 'username' | 'color' | 'email' | 'role'>): AuthUser => ({
  id: r.id,
  username: r.username,
  color: r.color,
  email: r.email,
  role: r.role,
});

export interface Session {
  user: AuthUser;
  access: string;
  /** null — refresh не менялся (параллельный запрос из соседней вкладки) */
  refresh: string | null;
}

export async function register(db: Db, username: string, password: string, role: GlobalRole = 'member') {
  const exists = first(await db.select({ id: users.id }).from(users).where(eq(users.username, username)));
  if (exists) throw new AuthError('этот логин уже занят', 409);
  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ username, passwordHash, role, color: await nextUserColor(db) })
    .returning();
  return row!;
}

export async function verifyLogin(db: Db, username: string, password: string) {
  const row = first(await db.select().from(users).where(eq(users.username, username)));
  // одинаковая ошибка для неверного логина, пароля и заблокированного аккаунта
  if (!row || !(await verifyPassword(password, row.passwordHash)) || !row.isActive) {
    throw new AuthError('неверный логин или пароль', 401);
  }
  return row;
}

async function insertRefresh(db: Db, userId: number, familyId: string, userAgent: string | undefined) {
  const token = randomToken();
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: sha256(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });
  return token;
}

/** Новый вход: access JWT + refresh в новой цепочке */
export async function startSession(db: Db, secret: string, user: UserRow, userAgent?: string): Promise<Session> {
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));
  // заодно чистим просроченные refresh-токены
  await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date().toISOString()));
  return {
    user: toAuthUser(user),
    access: await signAccess(secret, { userId: user.id, role: user.role, ver: user.tokenVersion }),
    refresh: await insertRefresh(db, user.id, randomToken(), userAgent),
  };
}

/** Обмен refresh на новую пару (ротация). Повторное использование отозванного токена гасит всю цепочку. */
export async function refreshSession(db: Db, secret: string, token: string, userAgent?: string): Promise<Session> {
  const now = Date.now();
  const row = first(await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(token))));
  if (!row || new Date(row.expiresAt).getTime() < now) throw new AuthError('сессия недействительна, войдите заново', 401);

  const user = first(await db.select().from(users).where(eq(users.id, row.userId)));
  const revokeFamily = () =>
    db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
  if (!user || !user.isActive) {
    await revokeFamily();
    throw new AuthError('сессия недействительна, войдите заново', 401);
  }
  const accessOnly = async (): Promise<Session> => ({
    user: toAuthUser(user),
    access: await signAccess(secret, { userId: user.id, role: user.role, ver: user.tokenVersion }),
    refresh: null,
  });

  if (row.revokedAt) {
    const recentlyRotated = row.rotatedAt && now - new Date(row.rotatedAt).getTime() < ROTATION_GRACE_MS;
    if (recentlyRotated) return accessOnly(); // соседняя вкладка уже получила новый refresh в cookie
    await revokeFamily(); // токен украден или переигран
    throw new AuthError('сессия недействительна, войдите заново', 401);
  }

  const stamp = new Date().toISOString();
  const rotated = await db
    .update(refreshTokens)
    .set({ revokedAt: stamp, rotatedAt: stamp })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  if (!rotated.length) return accessOnly(); // выиграл параллельный запрос

  return { ...(await accessOnly()), refresh: await insertRefresh(db, user.id, row.familyId, userAgent) };
}

/** Выход с этого устройства: гасим цепочку refresh-токена */
export async function endSession(db: Db, refreshToken: string) {
  const row = first(await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(refreshToken))));
  if (!row) return;
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
}

/** «Выйти везде»: все refresh отозваны, выданные access-токены перестают приниматься сразу */
export async function endAllSessions(db: Db, userId: number) {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Проверка access JWT + актуальности пользователя (активен, версия токена совпадает) */
export async function authenticate(db: Db, secret: string, accessToken: string): Promise<AuthUser | null> {
  const claims = await verifyAccess(secret, accessToken);
  if (!claims) return null;
  const row = first(await db.select().from(users).where(eq(users.id, claims.userId)));
  if (!row || !row.isActive || row.tokenVersion !== claims.ver) return null;
  return toAuthUser(row);
}
