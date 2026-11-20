import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { RESET_TTL_HOURS, type ChatSettings, canManageUser, canSeeRateOf, canSetRateOf, isAdminRole, type GlobalRole, type NotifySettings, type AdminBoard, type AdminUser, type BoardRole, type ServerEvent } from '@taskterm/shared';
import { bindDb, first, type Db } from '../../db/client';
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
import { audit } from '../audit/service';
import { hashPassword, randomToken, sha256 } from '../auth/password';
import type { AuthUser } from '../auth/service';
import { createBoardRow } from '../boards/service';
import { getChatSettings, saveChatSettings } from '../chat/settings';
import { getNotifySettings, saveNotifySettings } from '../notify/settings';

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RANK: Record<BoardRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

/** Ставка в списке — только та, что видит actor (canSeeRateOf), иначе null */
export async function listUsers(db: Db, actor: AuthUser): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      color: users.color,
      role: users.role,
      isActive: users.isActive,
      hourlyRate: users.hourlyRate,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      boardsCount: sql<number>`(select count(*)::int from ${boardMembers} where ${boardMembers.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(asc(users.username));
  return rows.map((u) => ({ ...u, hourlyRate: canSeeRateOf(actor, u) ? u.hourlyRate : null }));
}

function assertCanManage(actor: AuthUser, target: { id: number; role: GlobalRole }) {
  if (!canManageUser(actor, target)) throw new AdminError('недостаточно прав для действий с этим пользователем', 403);
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
    .where(and(inArray(users.role, ['owner', 'admin']), eq(users.isActive, true), ne(users.id, exceptId)))
    .for('update');
  if (!others.length) throw new AdminError('нельзя оставить приложение без администратора', 409);
}

async function getUser(db: Db, id: number) {
  const row = first(await db.select().from(users).where(eq(users.id, id)));
  if (!row) throw new AdminError('пользователь не найден', 404);
  return row;
}

async function updateUserRow(
  db: Db,
  actor: AuthUser,
  id: number,
  patch: { role?: 'admin' | 'moderator' | 'member'; isActive?: boolean },
) {
  const actorId = actor.id;
  return db.transaction(async (tx) => {
    const target = await getUser(tx, id);
    assertCanManage(actor, target);
    if (patch.role !== undefined) {
      if (!isAdminRole(actor.role)) throw new AdminError('менять роли могут только администраторы', 403);
      if (target.role === 'owner') throw new AdminError('роль владельца изменить нельзя', 400);
    }
    const blocking = patch.isActive === false && target.isActive;
    const demoting = patch.role !== undefined && patch.role !== 'admin' && target.role === 'admin';
    if (blocking && id === actorId) throw new AdminError('нельзя заблокировать самого себя', 400);
    if ((blocking || demoting) && isAdminRole(target.role) && target.isActive)
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
async function deleteUserRow(db: Db, actor: AuthUser, id: number, transferTo: number) {
  if (!isAdminRole(actor.role)) throw new AdminError('удалять пользователей могут только администраторы', 403);
  if (id === actor.id) throw new AdminError('нельзя удалить самого себя', 400);
  if (id === transferTo) throw new AdminError('передать данные нужно другому пользователю', 400);
  return db.transaction(async (tx) => {
    const target = await getUser(tx, id);
    const heir = await getUser(tx, transferTo);
    assertCanManage(actor, target);
    if (!heir.isActive) throw new AdminError('получатель заблокирован', 400);
    if (isAdminRole(target.role) && target.isActive) await assertOtherAdmin(tx, id);

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
async function createResetRow(db: Db, actor: AuthUser, userId: number) {
  const actorId = actor.id;
  const user = await getUser(db, userId);
  assertCanManage(actor, user);
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

async function setBoardManagedRow(db: Db, id: number, managedByAdmin: boolean) {
  const row = first(
    await db.update(boards).set({ managedByAdmin }).where(eq(boards.id, id)).returning(),
  );
  if (!row) throw new AdminError('доска не найдена', 404);
  return row;
}

// ─── Сценарии (use cases): изменение → журнал → события; шину и разрыв SSE отдаёт роут ──────
// `kick` — пользователи, чьи открытые SSE-потоки надо закрыть (блокировка, смена роли, удаление).

export async function updateUser(db: Db, actor: AuthUser, id: number, patch: { role?: 'admin' | 'moderator' | 'member'; isActive?: boolean }) {
  const { before, after, sessionsClosed } = await updateUserRow(db, actor, id, patch);
  if (before.role !== after.role) await audit(db, actor, 'user.role', `user:${after.username}`, { from: before.role, to: after.role });
  if (before.isActive !== after.isActive) await audit(db, actor, after.isActive ? 'user.unblock' : 'user.block', `user:${after.username}`);
  const user = (await listUsers(db, actor)).find((u) => u.id === after.id)!;
  const events: ServerEvent[] = [{ type: 'users', by: actor.id }];
  return { user, events, kick: sessionsClosed ? [after.id] : [] };
}

export async function deleteUser(db: Db, actor: AuthUser, id: number, transferTo: number) {
  const res = await deleteUserRow(db, actor, id, transferTo);
  await audit(db, actor, 'user.delete', `user:${res.username}`, { transferredTo: res.heir });
  const events: ServerEvent[] = [{ type: 'users', by: actor.id }, { type: 'boards', by: actor.id }];
  for (const boardId of res.boardIds) {
    events.push({ type: 'members', boardId, by: actor.id }, { type: 'board', boardId, by: actor.id });
  }
  return { events, kick: [id] };
}

export async function createReset(db: Db, actor: AuthUser, userId: number) {
  const { token, expiresAt, username } = await createResetRow(db, actor, userId);
  await audit(db, actor, 'user.reset_link', `user:${username}`);
  return { token, expiresAt };
}

/** Создать доску из админки: она сразу защищена (управлять ею могут только админы) */
export async function createBoard(db: Db, actor: AuthUser, name: string) {
  const board = await createBoardRow(db, name, actor.id, true);
  await audit(db, actor, 'board.create', `board:${board.id}`, { name: board.name });
  const row = (await listBoards(db)).find((b) => b.id === board.id)!;
  return { board: row, events: [{ type: 'boards', by: actor.id }] as ServerEvent[] };
}

/** Включить/снять защиту доски */
export async function setBoardManaged(db: Db, actor: AuthUser, id: number, managedByAdmin: boolean) {
  const row = await setBoardManagedRow(db, id, managedByAdmin);
  await audit(db, actor, managedByAdmin ? 'board.protect' : 'board.unprotect', `board:${row.id}`);
  const board = (await listBoards(db)).find((b) => b.id === row.id)!;
  const events: ServerEvent[] = [{ type: 'boards', by: actor.id }, { type: 'board', boardId: row.id, by: actor.id }];
  return { board, events };
}

/** Ставка сотрудника: owner — любую, admin — участников и модераторов; значение пишется в журнал (суммы не светим другим) */
export async function setRate(db: Db, actor: AuthUser, id: number, hourlyRate: number) {
  const target = await getUser(db, id);
  if (!canSetRateOf(actor, target)) throw new AdminError('недостаточно прав менять ставку этого сотрудника', 403);
  await db.update(users).set({ hourlyRate }).where(eq(users.id, id));
  await audit(db, actor, 'user.rate', `user:${target.username}`, // ставки владельца и админов в журнал не пишем: его читают все админы
    isAdminRole(target.role) ? {} : { from: target.hourlyRate, to: hourlyRate });
  const user = (await listUsers(db, actor)).find((u) => u.id === id)!;
  return { user, events: [{ type: 'users', by: actor.id }] as ServerEvent[] };
}

/** Настройки уведомлений: читает любой админ, меняет тоже админ (пишется в журнал) */
async function setNotifySettings(db: Db, actor: AuthUser, input: NotifySettings) {
  const out = await saveNotifySettings(db, input);
  await audit(db, actor, 'notify.settings', '', out);
  return out;
}

/** Общие настройки чата (срок хранения, кто удаляет); пишется в журнал */
async function setChatSettings(db: Db, actor: AuthUser, input: ChatSettings) {
  const out = await saveChatSettings(db, input);
  await audit(db, actor, 'chat.settings', '', out);
  return out;
}

/** Сервис, привязанный к БД: `const svc = createAdminService(db)` */
export const createAdminService = (db: Db) =>
  bindDb(db, { listUsers, setRate, updateUser, deleteUser, createReset, listBoards, createBoard, setBoardManaged, getNotifySettings, setNotifySettings, getChatSettings, setChatSettings });
