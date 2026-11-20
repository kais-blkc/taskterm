import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { INVITE_TTL_DAYS, type BoardGrant, type GlobalRole, type Invite, type InviteStatus } from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
import { boardMembers, boards, invites, users } from '../../db/schema';
import { audit } from '../audit/service';
import { hashPassword, randomToken, sha256 } from '../auth/password';
import { AuthError, type AuthUser } from '../auth/service';
import { nextUserColor } from '../users/colors';

const DAY_MS = 24 * 60 * 60 * 1000;

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type InviteRow = typeof invites.$inferSelect;

function statusOf(r: InviteRow): InviteStatus {
  if (r.usedAt) return 'accepted';
  if (r.revokedAt) return 'revoked';
  if (new Date(r.expiresAt).getTime() < Date.now()) return 'expired';
  return 'pending';
}

const listSelect = {
  invite: invites,
  invitedByName: users.username,
};

const toInvite = (r: { invite: InviteRow; invitedByName: string }): Invite => ({
  id: r.invite.id,
  email: r.invite.email,
  role: r.invite.role,
  boards: r.invite.boardGrants,
  status: statusOf(r.invite),
  invitedBy: r.invitedByName,
  createdAt: r.invite.createdAt,
  expiresAt: r.invite.expiresAt,
  usedAt: r.invite.usedAt,
});

export async function listInvites(db: Db): Promise<Invite[]> {
  const rows = await db
    .select(listSelect)
    .from(invites)
    .innerJoin(users, eq(users.id, invites.invitedBy))
    .orderBy(desc(invites.id));
  return rows.map(toInvite);
}

async function getInvite(db: Db, id: number) {
  const row = first(
    await db.select(listSelect).from(invites).innerJoin(users, eq(users.id, invites.invitedBy)).where(eq(invites.id, id)),
  );
  if (!row) throw new InviteError('приглашение не найдено', 404);
  return row;
}

async function validateGrants(db: Db, grants: BoardGrant[]) {
  const unique = new Map(grants.map((g) => [g.boardId, g])); // по доске — последняя роль
  const ids = [...unique.keys()];
  if (ids.length) {
    const found = await db.select({ id: boards.id }).from(boards).where(inArray(boards.id, ids));
    if (found.length !== ids.length) throw new InviteError('доска не найдена', 400);
  }
  return [...unique.values()];
}

/** Создать приглашение. Прежние ожидающие приглашения на этот email отзываются. Токен возвращается один раз. */
async function createInviteRow(
  db: Db,
  invitedBy: number,
  input: { email: string; role: GlobalRole; boards: BoardGrant[] },
) {
  const email = input.email.toLowerCase();
  const taken = first(await db.select({ id: users.id }).from(users).where(eq(users.email, email)));
  if (taken) throw new InviteError('пользователь с таким email уже зарегистрирован', 409);
  const grants = await validateGrants(db, input.boards);

  const token = randomToken();
  const id = await db.transaction(async (tx) => {
    await tx
      .update(invites)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(invites.email, email), isNull(invites.usedAt), isNull(invites.revokedAt)));
    const [row] = await tx
      .insert(invites)
      .values({
        email,
        tokenHash: sha256(token),
        role: input.role,
        boardGrants: grants,
        invitedBy,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS).toISOString(),
      })
      .returning({ id: invites.id });
    return row!.id;
  });
  return { invite: toInvite(await getInvite(db, id)), token };
}

/** «Новая ссылка»: старое приглашение отзывается, создаётся такое же с новым токеном и сроком */
async function resendInviteRow(db: Db, id: number, invitedBy: number) {
  const { invite } = await getInvite(db, id);
  if (invite.usedAt) throw new InviteError('приглашение уже принято', 409);
  return createInviteRow(db, invitedBy, { email: invite.email, role: invite.role, boards: invite.boardGrants });
}

async function revokeInviteRow(db: Db, id: number) {
  const { invite } = await getInvite(db, id);
  if (invite.usedAt) throw new InviteError('приглашение уже принято', 409);
  await db.update(invites).set({ revokedAt: new Date().toISOString() }).where(and(eq(invites.id, id), isNull(invites.revokedAt)));
}

/** Живое приглашение по токену из ссылки или null */
async function findUsable(db: Db, token: string) {
  const row = first(
    await db
      .select(listSelect)
      .from(invites)
      .innerJoin(users, eq(users.id, invites.invitedBy))
      .where(eq(invites.tokenHash, sha256(token))),
  );
  return row && statusOf(row.invite) === 'pending' ? row : null;
}

const INVALID = 'приглашение недействительно или просрочено';

export async function checkInvite(db: Db, token: string) {
  const row = await findUsable(db, token);
  if (!row) throw new InviteError(INVALID, 404);
  return { email: row.invite.email, invitedBy: row.invitedByName };
}

/**
 * Регистрация по приглашению. Приглашение «занимается» атомарно в той же транзакции, что и создание пользователя:
 * две параллельные регистрации по одной ссылке не пройдут, а при ошибке (ник занят) приглашение остаётся живым.
 */
export async function acceptInvite(db: Db, token: string, username: string, password: string) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const claimed = first(
      await tx
        .update(invites)
        .set({ usedAt: new Date().toISOString() })
        .where(
          and(
            eq(invites.tokenHash, sha256(token)),
            isNull(invites.usedAt),
            isNull(invites.revokedAt),
            sql`${invites.expiresAt} > now()`,
          ),
        )
        .returning(),
    );
    if (!claimed) throw new InviteError(INVALID, 400);

    if (first(await tx.select({ id: users.id }).from(users).where(eq(users.username, username)))) {
      throw new AuthError('этот логин уже занят', 409);
    }
    if (first(await tx.select({ id: users.id }).from(users).where(eq(users.email, claimed.email)))) {
      throw new AuthError('пользователь с таким email уже зарегистрирован', 409);
    }

    const [user] = await tx
      .insert(users)
      .values({ username, passwordHash, email: claimed.email, role: claimed.role, color: await nextUserColor(tx) })
      .returning();

    // доски могли удалить после создания приглашения — пропускаем
    const alive = claimed.boardGrants.length
      ? await tx
          .select({ id: boards.id })
          .from(boards)
          .where(inArray(boards.id, claimed.boardGrants.map((g) => g.boardId)))
      : [];
    const aliveIds = new Set(alive.map((b) => b.id));
    const grants = claimed.boardGrants.filter((g) => aliveIds.has(g.boardId));
    if (grants.length) {
      await tx.insert(boardMembers).values(grants.map((g) => ({ boardId: g.boardId, userId: user!.id, role: g.role })));
    }
    return { user: user!, grantedBoardIds: grants.map((g) => g.boardId) };
  });
}

// ─── Сценарии (use cases): изменение → журнал ────────────────────────────────────────────

/** Модератор приглашает и управляет приглашениями только обычных участников */
function assertCanInviteRole(actor: AuthUser, role: GlobalRole) {
  if (actor.role === 'moderator' && role !== 'member') throw new InviteError('модератор может приглашать только участников', 403);
}

export async function createInvite(db: Db, actor: AuthUser, input: { email: string; role: GlobalRole; boards: BoardGrant[] }) {
  assertCanInviteRole(actor, input.role);
  const { invite, token } = await createInviteRow(db, actor.id, input);
  await audit(db, actor, 'invite.create', `invite:${invite.email}`, { role: invite.role, boards: invite.boards.length });
  return { ...invite, token };
}

export async function resendInvite(db: Db, actor: AuthUser, id: number) {
  assertCanInviteRole(actor, (await getInvite(db, id)).invite.role);
  const { invite, token } = await resendInviteRow(db, id, actor.id);
  await audit(db, actor, 'invite.resend', `invite:${invite.email}`);
  return { ...invite, token };
}

export async function revokeInvite(db: Db, actor: AuthUser, id: number) {
  assertCanInviteRole(actor, (await getInvite(db, id)).invite.role);
  await revokeInviteRow(db, id);
  await audit(db, actor, 'invite.revoke', `invite:${id}`);
}

/** Сервис, привязанный к БД: `const svc = createInviteService(db)` */
export const createInviteService = (db: Db) => bindDb(db, { listInvites, createInvite, resendInvite, revokeInvite, checkInvite });
