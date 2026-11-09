import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { RESET_TTL_HOURS, type AdminBoard, type AdminUser, type BoardRole } from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import {
  boardMembers,
  boards,
  comments,
  invites,
  passwordResets,
  refreshTokens,
  tasks,
  users,
} from '../../db/schema';
import { hashPassword, randomToken, sha256 } from '../auth/password';

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RANK: Record<BoardRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

export async function listUsers(db: Db): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      color: users.color,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      boardsCount: sql<number>`(select count(*)::int from ${boardMembers} where ${boardMembers.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(asc(users.username));
  return rows;
}

/** Закрыть все сессии пользователя: старые access перестают приниматься, refresh отозваны */
async function dropSessions(tx: Db, userId: number) {
  await tx
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/** Блокируем строки активных админов и проверяем, что кроме `exceptId` остался хотя бы один */
async function assertOtherAdmin(tx: Db, exceptId: number) {
  const others = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, true), ne(users.id, exceptId)))
    .for('update');
  if (!others.length) throw new AdminError('нельзя оставить приложение без администратора', 409);
}

async function getUser(db: Db, id: number) {
  const row = first(await db.select().from(users).where(eq(users.id, id)));
  if (!row) throw new AdminError('user not found', 404);
  return row;
}

export async function updateUser(
  db: Db,
  actorId: number,
  id: number,
  patch: { role?: 'admin' | 'member'; isActive?: boolean },
) {
  return db.transaction(async (tx) => {
    const target = await getUser(tx, id);
    const blocking = patch.isActive === false && target.isActive;
    const demoting = patch.role === 'member' && target.role === 'admin';
    if (blocking && id === actorId) throw new AdminError('нельзя заблокировать самого себя', 400);
    if ((blocking || demoting) && target.role === 'admin' && target.isActive)
      await assertOtherAdmin(tx, id);

    const set: Partial<typeof users.$inferInsert> = {};
    if (patch.role !== undefined) set.role = patch.role;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    if (Object.keys(set).length) await tx.update(users).set(set).where(eq(users.id, id));
    const changed = (patch.role !== undefined && patch.role !== target.role) || blocking;
    if (blocking) await dropSessions(tx, id);
    else if (changed)
      await tx
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, id));
    return { before: target, after: await getUser(tx, id), sessionsClosed: blocking || changed };
  });
}

/**
 * Удаление: доски, задачи, комментарии и приглашения переходят к transferTo,
 * который получает на его досках не меньшую роль. Исполнитель в задачах снимается.
 */
export async function deleteUser(db: Db, actorId: number, id: number, transferTo: number) {
  if (id === actorId) throw new AdminError('нельзя удалить самого себя', 400);
  if (id === transferTo) throw new AdminError('передать данные нужно другому пользователю', 400);
  return db.transaction(async (tx) => {
    const target = await getUser(tx, id);
    const heir = await getUser(tx, transferTo);
    if (!heir.isActive) throw new AdminError('получатель заблокирован', 400);
    if (target.role === 'admin' && target.isActive) await assertOtherAdmin(tx, id);

    const mine = await tx.select().from(boardMembers).where(eq(boardMembers.userId, id));
    for (const m of mine) {
      const existing = first(
        await tx
          .select()
          .from(boardMembers)
          .where(and(eq(boardMembers.boardId, m.boardId), eq(boardMembers.userId, transferTo))),
      );
      if (!existing)
        await tx
          .insert(boardMembers)
          .values({ boardId: m.boardId, userId: transferTo, role: m.role });
      else if (RANK[m.role] > RANK[existing.role]) {
        await tx
          .update(boardMembers)
          .set({ role: m.role })
          .where(and(eq(boardMembers.boardId, m.boardId), eq(boardMembers.userId, transferTo)));
      }
    }
    // автор задачи — всегда участник с правом редактировать; доски, где получатель слабее, повышаем
    const authored = await tx
      .selectDistinct({ boardId: tasks.boardId })
      .from(tasks)
      .where(eq(tasks.authorId, id));
    for (const { boardId } of authored) {
      const row = first(
        await tx
          .select()
          .from(boardMembers)
          .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, transferTo))),
      );
      if (!row)
        await tx.insert(boardMembers).values({ boardId, userId: transferTo, role: 'editor' });
      else if (RANK[row.role] < RANK.editor) {
        await tx
          .update(boardMembers)
          .set({ role: 'editor' })
          .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, transferTo)));
      }
    }
    await tx.update(tasks).set({ authorId: transferTo }).where(eq(tasks.authorId, id));
    // ответственные (task_assignees) удаляются каскадом вместе с пользователем
    await tx.update(comments).set({ authorId: transferTo }).where(eq(comments.authorId, id));
    await tx.update(boards).set({ createdBy: transferTo }).where(eq(boards.createdBy, id));
    await tx.update(invites).set({ invitedBy: transferTo }).where(eq(invites.invitedBy, id));
    await tx.delete(users).where(eq(users.id, id)); // refresh, членство, сбросы — каскадом
    return { username: target.username, heir: heir.username, boardIds: mine.map((m) => m.boardId) };
  });
}

/** Ссылка сброса пароля: прежние неиспользованные гасятся, токен виден один раз */
export async function createReset(db: Db, actorId: number, userId: number) {
  const user = await getUser(db, userId);
  if (!user.isActive) throw new AdminError('пользователь заблокирован', 409);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 3600_000).toISOString();
  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResets)
      .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await tx
      .insert(passwordResets)
      .values({ userId, tokenHash: sha256(token), createdBy: actorId, expiresAt });
  });
  return { token, expiresAt, username: user.username };
}

async function findReset(db: Db, token: string) {
  const row = first(
    await db
      .select({ reset: passwordResets, user: users })
      .from(passwordResets)
      .innerJoin(users, eq(users.id, passwordResets.userId))
      .where(eq(passwordResets.tokenHash, sha256(token))),
  );
  const ok =
    row &&
    !row.reset.usedAt &&
    new Date(row.reset.expiresAt).getTime() > Date.now() &&
    row.user.isActive;
  return ok ? row : null;
}

export async function checkReset(db: Db, token: string) {
  const row = await findReset(db, token);
  if (!row) throw new AdminError('ссылка недействительна или просрочена', 404);
  return { username: row.user.username };
}

/** Новый пароль по ссылке: ссылка гасится атомарно, все прежние сессии закрываются */
export async function applyReset(db: Db, token: string, password: string) {
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const found = await findReset(tx, token);
    if (!found) throw new AdminError('ссылка недействительна или просрочена', 400);
    const claimed = await tx
      .update(passwordResets)
      .set({ usedAt: new Date().toISOString() })
      .where(and(eq(passwordResets.id, found.reset.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (!claimed.length) throw new AdminError('ссылка недействительна или просрочена', 400);
    await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, found.user.id));
    await dropSessions(tx, found.user.id);
    return (await getUser(tx, found.user.id)) as typeof users.$inferSelect;
  });
}

export async function listBoards(db: Db): Promise<AdminBoard[]> {
  const rows = await db.select().from(boards).orderBy(asc(boards.id));
  if (!rows.length) return [];
  const ids = rows.map((b) => b.id);
  const members = await db
    .select({ boardId: boardMembers.boardId, role: boardMembers.role, username: users.username })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(inArray(boardMembers.boardId, ids));
  const taskCounts = await db
    .select({ boardId: tasks.boardId, n: count() })
    .from(tasks)
    .where(inArray(tasks.boardId, ids))
    .groupBy(tasks.boardId);
  return rows.map((b) => {
    const ms = members.filter((m) => m.boardId === b.id);
    return {
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      membersCount: ms.length,
      tasksCount: taskCounts.find((t) => t.boardId === b.id)?.n ?? 0,
      owners: ms.filter((m) => m.role === 'owner').map((m) => m.username),
      managedByAdmin: b.managedByAdmin,
    };
  });
}

export async function setBoardManaged(db: Db, id: number, managedByAdmin: boolean) {
  const row = first(
    await db.update(boards).set({ managedByAdmin }).where(eq(boards.id, id)).returning(),
  );
  if (!row) throw new AdminError('board not found', 404);
  return row;
}
