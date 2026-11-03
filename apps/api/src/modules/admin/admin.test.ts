import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { passwordResets } from '../../db/schema';
import { signupUser } from '../../test-utils';

describe('admin panel', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let root: U, member: U, other: U;

  const call = (u: U | undefined, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const mk = async (name: string, role: 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const login = (username: string, password = 'secret123') =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.ready();
    root = await mk('rootadm', 'admin');
    member = await mk('member1');
    other = await mk('member2');
  });
  afterEach(() => app.close());

  it('only admin: members get 403, anonymous 401', async () => {
    for (const [m, url] of [
      ['GET', '/api/admin/users'],
      ['GET', '/api/admin/boards'],
      ['GET', '/api/admin/audit'],
      ['PATCH', `/api/admin/users/${other.id}`],
      ['POST', `/api/admin/users/${other.id}/reset-password`],
      ['DELETE', `/api/admin/users/${other.id}`],
    ] as const) {
      expect((await call(member, m, url, { role: 'admin', transferTo: member.id })).statusCode, `member ${m} ${url}`).toBe(403);
      expect((await call(undefined, m, url, { role: 'admin', transferTo: member.id })).statusCode, `anon ${m} ${url}`).toBe(401);
    }
  });

  it('lists users without secrets', async () => {
    const res = await call(root, 'GET', '/api/admin/users');
    expect(res.json().map((u: any) => u.username)).toEqual(['member1', 'member2', 'rootadm']);
    expect(res.json()[0]).toMatchObject({ role: 'member', isActive: true, boardsCount: 0 });
    expect(JSON.stringify(res.json())).not.toMatch(/hash|password/i);
  });

  it('block: sessions die at once, login is refused, unblock restores login', async () => {
    const refresh = (await login('member1')).cookies.find((c) => c.name === 'tt_refresh')!;
    expect((await call(root, 'PATCH', `/api/admin/users/${member.id}`, { isActive: false })).json().isActive).toBe(false);
    expect((await call(member, 'GET', '/api/auth/me')).statusCode).toBe(401);
    expect((await login('member1')).statusCode).toBe(401);
    const r = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: `tt_refresh=${refresh.value}` } });
    expect(r.statusCode).toBe(401);
    await call(root, 'PATCH', `/api/admin/users/${member.id}`, { isActive: true });
    expect((await login('member1')).statusCode).toBe(200);
  });

  it('role change invalidates the old access token', async () => {
    const res = await call(root, 'PATCH', `/api/admin/users/${member.id}`, { role: 'admin' });
    expect(res.json().role).toBe('admin');
    expect((await call(member, 'GET', '/api/auth/me')).statusCode).toBe(401);
    const again = await login('member1');
    expect(again.json().role).toBe('admin');
  });

  it('cannot block yourself, demote or block or delete the last admin', async () => {
    expect((await call(root, 'PATCH', `/api/admin/users/${root.id}`, { isActive: false })).statusCode).toBe(400);
    expect((await call(root, 'PATCH', `/api/admin/users/${root.id}`, { role: 'member' })).statusCode).toBe(409);
    expect((await call(root, 'DELETE', `/api/admin/users/${root.id}`, { transferTo: member.id })).statusCode).toBe(400);
    // второй админ: теперь одного можно понизить, но не обоих
    let second = await mk('rootadm2', 'admin');
    expect((await call(root, 'PATCH', `/api/admin/users/${second.id}`, { role: 'member' })).statusCode).toBe(200);
    expect((await call(root, 'PATCH', `/api/admin/users/${second.id}`, { role: 'admin' })).statusCode).toBe(200);
    const relog = await login('rootadm2'); // смена роли закрыла прежнюю сессию
    second = { ...second, cookie: `tt_access=${relog.cookies.find((c) => c.name === 'tt_access')!.value}` };
    expect((await call(second, 'PATCH', `/api/admin/users/${root.id}`, { isActive: false })).statusCode).toBe(200);
    // root заблокирован — second остался единственным активным админом
    expect((await call(second, 'PATCH', `/api/admin/users/${second.id}`, { role: 'member' })).statusCode).toBe(409);
    expect((await call(second, 'DELETE', `/api/admin/users/${root.id}`, { transferTo: member.id })).statusCode).toBe(204);
  });

  it('reset link: one-time, sets the password, closes old sessions, logs in', async () => {
    const created = await call(root, 'POST', `/api/admin/users/${member.id}/reset-password`);
    expect(created.statusCode).toBe(201);
    const { token } = created.json();
    expect(await call(undefined, 'GET', `/api/auth/reset/check?token=${token}`).then((r) => r.json())).toEqual({ username: 'member1' });

    const done = await call(undefined, 'POST', '/api/auth/reset', { token, password: 'brandnew1' });
    expect(done.statusCode).toBe(200);
    expect(done.cookies.some((c) => c.name === 'tt_access')).toBe(true);
    expect((await call(member, 'GET', '/api/auth/me')).statusCode).toBe(401); // старая сессия закрыта
    expect((await login('member1')).statusCode).toBe(401);
    expect((await login('member1', 'brandnew1')).statusCode).toBe(200);
    // второй раз та же ссылка не работает
    expect((await call(undefined, 'POST', '/api/auth/reset', { token, password: 'another12' })).statusCode).toBe(400);
    expect((await call(undefined, 'GET', `/api/auth/reset/check?token=${token}`)).statusCode).toBe(404);
  });

  it('reset: token stored hashed, new link voids the old, expired and blocked are refused', async () => {
    const a = (await call(root, 'POST', `/api/admin/users/${member.id}/reset-password`)).json();
    const b = (await call(root, 'POST', `/api/admin/users/${member.id}/reset-password`)).json();
    expect((await call(undefined, 'GET', `/api/auth/reset/check?token=${a.token}`)).statusCode).toBe(404);
    const [row] = await app.db.select().from(passwordResets);
    expect(row!.tokenHash).not.toBe(b.token);

    await app.db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(passwordResets.id, row!.id));
    expect((await call(undefined, 'POST', '/api/auth/reset', { token: b.token, password: 'brandnew1' })).statusCode).toBe(400);

    await call(root, 'PATCH', `/api/admin/users/${other.id}`, { isActive: false });
    expect((await call(root, 'POST', `/api/admin/users/${other.id}/reset-password`)).statusCode).toBe(409);
    expect((await call(root, 'POST', '/api/admin/users/9999/reset-password')).statusCode).toBe(404);
    expect((await call(undefined, 'POST', '/api/auth/reset', { token: 'x'.repeat(30), password: 'brandnew1' })).statusCode).toBe(400);
  });

  it('delete: data goes to the heir, boards stay owned, assignee is cleared', async () => {
    const board = (await call(member, 'POST', '/api/boards', { name: 'Mine' })).json();
    const col = (await call(member, 'GET', `/api/boards/${board.id}`)).json().columns[0].id;
    const task = (await call(member, 'POST', `/api/boards/${board.id}/tasks`, { columnId: col, title: 't' })).json();
    await call(member, 'POST', `/api/tasks/${task.id}/comments`, { body: 'hello' });
    await call(member, 'PUT', `/api/boards/${board.id}/members/${other.id}`, { role: 'viewer' });
    await call(member, 'PATCH', `/api/tasks/${task.id}`, { assigneeId: member.id });

    expect((await call(root, 'DELETE', `/api/admin/users/${member.id}`, { transferTo: member.id })).statusCode).toBe(400);
    expect((await call(root, 'DELETE', `/api/admin/users/${member.id}`, { transferTo: 9999 })).statusCode).toBe(404);
    expect((await call(root, 'DELETE', `/api/admin/users/${member.id}`, { transferTo: other.id })).statusCode).toBe(204);

    expect((await login('member1')).statusCode).toBe(401);
    const t = (await call(other, 'GET', `/api/tasks/${task.id}`)).json();
    expect(t).toMatchObject({ authorId: other.id, assigneeId: null });
    // получатель был наблюдателем — стал владельцем доски, задача снова редактируема им
    expect((await call(other, 'GET', `/api/boards/${board.id}`)).json().board.myRole).toBe('owner');
    expect((await call(other, 'GET', `/api/tasks/${task.id}/comments`)).json()[0]).toMatchObject({ authorName: 'member2', body: 'hello' });
    expect((await call(root, 'GET', '/api/admin/users')).json().map((u: any) => u.username)).not.toContain('member1');
  });

  it('delete: blocked heir is refused', async () => {
    await call(root, 'PATCH', `/api/admin/users/${other.id}`, { isActive: false });
    expect((await call(root, 'DELETE', `/api/admin/users/${member.id}`, { transferTo: other.id })).statusCode).toBe(400);
  });

  it('boards overview and audit log', async () => {
    const board = (await call(member, 'POST', '/api/boards', { name: 'Alpha' })).json();
    const col = (await call(member, 'GET', `/api/boards/${board.id}`)).json().columns[0].id;
    await call(member, 'POST', `/api/boards/${board.id}/tasks`, { columnId: col, title: 't' });
    expect((await call(root, 'GET', '/api/admin/boards')).json()).toEqual([
      expect.objectContaining({ name: 'Alpha', membersCount: 1, tasksCount: 1, owners: ['member1'] }),
    ]);

    await call(root, 'PATCH', `/api/admin/users/${other.id}`, { isActive: false });
    await call(root, 'POST', '/api/invites', { email: 'x@example.com' });
    await call(member, 'PUT', `/api/boards/${board.id}/members/${other.id}`, { role: 'viewer' });
    const log = (await call(root, 'GET', '/api/admin/audit')).json();
    expect(log.map((e: any) => e.action)).toEqual(['board.member', 'invite.create', 'user.block']);
    expect(log[2]).toMatchObject({ actorName: 'rootadm', target: 'user:member2' });
    // курсор
    const page = (await call(root, 'GET', `/api/admin/audit?limit=1&before=${log[0].id}`)).json();
    expect(page).toHaveLength(1);
    expect(page[0].action).toBe('invite.create');
    expect((await call(root, 'GET', '/api/admin/audit?limit=0')).statusCode).toBe(400);
  });

  describe('boards created by an admin are protected', () => {
    const make = async (url = '/api/admin/boards') => (await call(root, 'POST', url, { name: 'Company' })).json();

    it('admin creates a board from the panel; it is protected and owned by the admin', async () => {
      const res = await call(root, 'POST', '/api/admin/boards', { name: 'Company' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: 'Company', managedByAdmin: true, owners: ['rootadm'], tasksCount: 0 });
      expect((await call(member, 'POST', '/api/admin/boards', { name: 'x' })).statusCode).toBe(403);
      expect((await call(root, 'POST', '/api/admin/boards', { name: '  ' })).statusCode).toBe(400);
      // обычный POST /api/boards от админа тоже создаёт защищённую доску, от участника — нет
      expect((await call(root, 'POST', '/api/boards', { name: 'Mine' })).json()).toMatchObject({ managedByAdmin: true, canManage: true });
      expect((await call(member, 'POST', '/api/boards', { name: 'Theirs' })).json()).toMatchObject({ managedByAdmin: false, canManage: true });
    });

    it('members, even with the owner role, cannot rename/delete the board, change columns or members', async () => {
      const b = await make();
      await call(root, 'PUT', `/api/boards/${b.id}/members/${member.id}`, { role: 'owner' });
      await call(root, 'PUT', `/api/boards/${b.id}/members/${other.id}`, { role: 'editor' });
      const col = (await call(root, 'GET', `/api/boards/${b.id}`)).json().columns[0].id;

      const mine = (await call(member, 'GET', `/api/boards/${b.id}`)).json().board;
      expect(mine).toMatchObject({ myRole: 'owner', managedByAdmin: true, canManage: false });
      expect((await call(root, 'GET', `/api/boards/${b.id}`)).json().board.canManage).toBe(true);
      expect((await call(member, 'GET', '/api/boards')).json()[0]).toMatchObject({ canManage: false });

      const denied = [
        await call(member, 'PATCH', `/api/boards/${b.id}`, { name: 'Hacked' }),
        await call(member, 'DELETE', `/api/boards/${b.id}`),
        await call(member, 'POST', `/api/boards/${b.id}/columns`, { name: 'New' }),
        await call(member, 'PATCH', `/api/columns/${col}`, { name: 'Renamed' }),
        await call(member, 'DELETE', `/api/columns/${col}`),
        await call(member, 'PUT', `/api/boards/${b.id}/members/${other.id}`, { role: 'viewer' }),
        await call(member, 'DELETE', `/api/boards/${b.id}/members/${other.id}`),
      ];
      expect(denied.map((r) => r.statusCode)).toEqual([403, 403, 403, 403, 403, 403, 403]);

      // работа с задачами не ограничена: владелец создаёт задачи и удаляет любые
      const t = await call(other, 'POST', `/api/boards/${b.id}/tasks`, { columnId: col, title: 't' });
      expect(t.statusCode).toBe(201);
      expect((await call(member, 'DELETE', `/api/tasks/${t.json().id}`)).statusCode).toBe(204);
      // выйти с доски участник может
      expect((await call(other, 'DELETE', `/api/boards/${b.id}/members/${other.id}`)).statusCode).toBe(204);

      // админ управляет всем
      expect((await call(root, 'PATCH', `/api/boards/${b.id}`, { name: 'Renamed' })).statusCode).toBe(200);
      expect((await call(root, 'POST', `/api/boards/${b.id}/columns`, { name: 'New' })).statusCode).toBe(201);
    });

    it('protection can be switched off and on; audit records it', async () => {
      const b = await make();
      await call(root, 'PUT', `/api/boards/${b.id}/members/${member.id}`, { role: 'owner' });
      const off = await call(root, 'PATCH', `/api/admin/boards/${b.id}`, { managedByAdmin: false });
      expect(off.json().managedByAdmin).toBe(false);
      expect((await call(member, 'PATCH', `/api/boards/${b.id}`, { name: 'Mine now' })).statusCode).toBe(200);
      expect((await call(member, 'GET', `/api/boards/${b.id}`)).json().board.canManage).toBe(true);
      await call(root, 'PATCH', `/api/admin/boards/${b.id}`, { managedByAdmin: true });
      expect((await call(member, 'PATCH', `/api/boards/${b.id}`, { name: 'again' })).statusCode).toBe(403);
      expect((await call(root, 'PATCH', '/api/admin/boards/9999', { managedByAdmin: true })).statusCode).toBe(404);
      expect((await call(member, 'PATCH', `/api/admin/boards/${b.id}`, { managedByAdmin: false })).statusCode).toBe(403);
      const actions = (await call(root, 'GET', '/api/admin/audit')).json().map((e: any) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['board.create', 'board.protect', 'board.unprotect']));
    });
  });
});
