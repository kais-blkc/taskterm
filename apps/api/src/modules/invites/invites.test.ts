import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../app';
import { loadConfig, type Config } from '../../config';
import { invites, users } from '../../db/schema';
import { signupUser } from '../../test-utils';
import { ACCESS_COOKIE } from '../auth/guard';

describe('invites & registration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: string;
  let member: string;

  const start = async (over: Partial<Config> = {}) => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', ...over }), { logger: false });
    await app.ready();
  };
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) => `${ACCESS_COOKIE}=${res.cookies.find((c) => c.name === ACCESS_COOKIE)!.value}`;
  const call = (cookie: string | undefined, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
  const invite = async (body: object = { email: 'new@example.com' }) => {
    const res = await call(admin, 'POST', '/api/invites', body);
    return { res, json: res.json(), token: res.json().token as string };
  };
  const register = (token: string, username = 'newbie', password = 'secret123') =>
    call(undefined, 'POST', '/api/auth/register', { token, username, password });

  beforeEach(async () => {
    await start();
    admin = cookieOf(await signupUser(app, 'root', 'secret123', 'admin'));
    member = cookieOf(await signupUser(app, 'plain'));
  });
  afterEach(() => app.close());

  it('only admin manages invites', async () => {
    for (const [m, url, body] of [
      ['GET', '/api/invites', undefined],
      ['POST', '/api/invites', { email: 'a@b.co' }],
      ['DELETE', '/api/invites/1', undefined],
      ['POST', '/api/invites/1/resend', undefined],
    ] as const) {
      expect((await call(member, m, url, body)).statusCode, `member ${m} ${url}`).toBe(403);
      expect((await call(undefined, m, url, body)).statusCode, `anon ${m} ${url}`).toBe(401);
    }
  });

  it('create → check → register: email is fixed, role and boards are granted, user is logged in', async () => {
    const board = (await call(admin, 'POST', '/api/boards', { name: 'Team' })).json();
    const { res, json, token } = await invite({ email: 'New@Example.com', role: 'member', boards: [{ boardId: board.id, role: 'commenter' }] });
    expect(res.statusCode).toBe(201);
    expect(json).toMatchObject({ email: 'new@example.com', status: 'pending', invitedBy: 'root', boards: [{ boardId: board.id, role: 'commenter' }] });
    expect(token.length).toBeGreaterThan(30);

    const check = await call(undefined, 'GET', `/api/invites/check?token=${token}`);
    expect(check.json()).toEqual({ email: 'new@example.com', invitedBy: 'root' });

    const reg = await register(token);
    expect(reg.statusCode).toBe(200);
    expect(reg.json()).toMatchObject({ username: 'newbie', email: 'new@example.com', role: 'member' });
    const cookie = cookieOf(reg);
    expect((await call(cookie, 'GET', '/api/auth/me')).statusCode).toBe(200);
    // доступ к доске из приглашения
    const boards = (await call(cookie, 'GET', '/api/boards')).json();
    expect(boards).toEqual([expect.objectContaining({ id: board.id, myRole: 'commenter' })]);

    // приглашение использовано
    expect((await call(admin, 'GET', '/api/invites')).json()[0]).toMatchObject({ status: 'accepted' });
    expect((await call(undefined, 'GET', `/api/invites/check?token=${token}`)).statusCode).toBe(404);
  });

  it('an invite can create an admin', async () => {
    const { token } = await invite({ email: 'boss@example.com', role: 'admin' });
    expect((await register(token, 'boss')).json().role).toBe('admin');
  });

  it('one-time: second registration with the same link fails; failed attempt (taken username) does not burn the link', async () => {
    const { token } = await invite();
    expect((await register(token, 'plain')).statusCode).toBe(409); // ник занят
    expect((await call(undefined, 'GET', `/api/invites/check?token=${token}`)).statusCode).toBe(200); // ссылка жива
    expect((await register(token, 'newbie')).statusCode).toBe(200);
    expect((await register(token, 'another')).statusCode).toBe(400);
  });

  it('parallel registrations by one link: exactly one wins', async () => {
    const { token } = await invite();
    const results = await Promise.all([register(token, 'racer1'), register(token, 'racer2'), register(token, 'racer3')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400, 400]);
    expect(await app.db.select().from(users).where(eq(users.email, 'new@example.com'))).toHaveLength(1);
  });

  it('garbage, revoked and expired links are rejected the same way', async () => {
    expect((await register('x'.repeat(40))).statusCode).toBe(400);
    expect((await call(undefined, 'GET', '/api/invites/check?token=nope')).statusCode).toBe(404);

    const revoked = await invite({ email: 'r@example.com' });
    expect((await call(admin, 'DELETE', `/api/invites/${revoked.json.id}`)).statusCode).toBe(204);
    expect((await register(revoked.token, 'user1')).statusCode).toBe(400);
    expect((await call(admin, 'GET', '/api/invites')).json().find((i: any) => i.id === revoked.json.id).status).toBe('revoked');

    const old = await invite({ email: 'old@example.com' });
    await app.db.update(invites).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(invites.id, old.json.id));
    expect((await register(old.token, 'user2')).statusCode).toBe(400);
    expect((await call(undefined, 'GET', `/api/invites/check?token=${old.token}`)).statusCode).toBe(404);
    expect((await call(admin, 'GET', '/api/invites')).json().find((i: any) => i.id === old.json.id).status).toBe('expired');
  });

  it('token is stored hashed; inviting the same email again revokes the earlier link; resend gives a new working link', async () => {
    const a = await invite();
    const [row] = await app.db.select().from(invites).where(eq(invites.id, a.json.id));
    expect(row!.tokenHash).not.toBe(a.token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const b = await invite();
    expect((await register(a.token, 'user1')).statusCode).toBe(400); // старая ссылка отозвана
    const c = await call(admin, 'POST', `/api/invites/${b.json.id}/resend`);
    expect(c.statusCode).toBe(201);
    expect((await register(b.token, 'user2')).statusCode).toBe(400);
    expect((await register(c.json().token, 'user3')).statusCode).toBe(200);
    expect((await call(admin, 'POST', `/api/invites/${c.json().id}/resend`)).statusCode).toBe(409); // уже принято
    expect((await call(admin, 'DELETE', `/api/invites/${c.json().id}`)).statusCode).toBe(409);
  });

  it('rejects an email that is already registered, bad email, unknown board; list never leaks tokens', async () => {
    const ok = await invite({ email: 'taken@example.com' });
    await register(ok.token, 'holder');
    expect((await call(admin, 'POST', '/api/invites', { email: 'taken@example.com' })).statusCode).toBe(409);
    expect((await call(admin, 'POST', '/api/invites', { email: 'not-an-email' })).statusCode).toBe(400);
    expect((await call(admin, 'POST', '/api/invites', { email: 'x@example.com', boards: [{ boardId: 9999, role: 'viewer' }] })).statusCode).toBe(400);
    expect(JSON.stringify((await call(admin, 'GET', '/api/invites')).json())).not.toMatch(/token/i);
  });

  it('a board deleted after the invite was issued is skipped, registration still works', async () => {
    const board = (await call(admin, 'POST', '/api/boards', { name: 'Gone' })).json();
    const { token } = await invite({ email: 'g@example.com', boards: [{ boardId: board.id, role: 'editor' }] });
    await call(admin, 'DELETE', `/api/boards/${board.id}`);
    const reg = await register(token, 'guest');
    expect(reg.statusCode).toBe(200);
    expect((await call(cookieOf(reg), 'GET', '/api/boards')).json()).toEqual([]);
  });

  it('the old open registration is gone; login does not need or accept a key', async () => {
    const res = await call(undefined, 'POST', '/api/auth/register', { username: 'sneaky', password: 'secret123', accessPassword: 'whatever' });
    expect(res.statusCode).toBe(400);
    expect((await call(undefined, 'POST', '/api/auth/login', { username: 'plain', password: 'secret123' })).statusCode).toBe(200);
  });

  it('rate-limits link checking per ip', async () => {
    await app.close();
    await start({ authRateLimitMax: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await call(undefined, 'GET', '/api/invites/check?token=nopenopenopenopenope')).statusCode);
    expect(codes).toEqual([404, 404, 429, 429]);
  });
});
