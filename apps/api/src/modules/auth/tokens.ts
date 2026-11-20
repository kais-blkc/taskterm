import { SignJWT, jwtVerify } from 'jose';
import { globalRoleSchema, type GlobalRole } from '@taskterm/shared';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ISSUER = 'taskterm';

export interface AccessClaims {
  userId: number;
  role: GlobalRole;
  /** users.token_version на момент выдачи */
  ver: number;
}

const key = (secret: string) => new TextEncoder().encode(secret);

/** ttlSec можно задать отрицательным — токен сразу просрочен (для тестов) */
export async function signAccess(secret: string, c: AccessClaims, ttlSec = ACCESS_TTL_SEC) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: c.role, ver: c.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(c.userId))
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key(secret));
}

export async function verifyAccess(secret: string, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, algorithms: ['HS256'] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || typeof payload.ver !== 'number') return null;
    return { userId, role: globalRoleSchema.safeParse(payload.role).data ?? 'member', ver: payload.ver };
  } catch {
    return null; // просрочен, подделан или битый
  }
}
