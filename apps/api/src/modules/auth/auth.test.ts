import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../app';
import { loadConfig, type Config } from '../../config';
import { refreshTokens, users } from '../../db/schema';
import { signupUser } from '../../test-utils';
import { ensureAdmin } from './bootstrap';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './guard';
import { ROTATION_GRACE_MS } from './service';
import { signAccess } from './tokens';

type Res = Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>;

describe('auth (JWT + refresh)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  const start = async (over: Partial<Config> = {}) => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', ...over }), { logger: false });
    await app.ready();
  };
  beforeEach(() => start());
  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  const post = (url: string, payload?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: { ...(cookie ? { cookie } : {}), ...headers } });
  const get = (url: string, cookie?: string) => app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const cookieVal = (res: Res, name: string) => res.cookies.find((c) => c.name === name)?.value;
  const jar = (res: Res) => {
    const a = cookieVal(res, ACCESS_COOKIE);
    const r = cookieVal(res, REFRESH_COOKIE);
    return { access: `${ACCESS_COOKIE}=${a}`, refresh: `${REFRESH_COOKIE}=${r}`, both: `${ACCESS_COOKIE}=${a}; ${REFRESH_COOKIE}=${r}` };
  };
  const signup = async () => jar(await signupUser(app, 'alice'));

  it('login sets httpOnly access + refresh cookies; refresh is scoped to /api/auth', async () => {
    const res = await signupUser(app, 'alice');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: 'alice', role: 'member', email: null });
    const access = res.cookies.find((c) => c.name === ACCESS_COOKIE)!;
    const refresh = res.cookies.find((c) => c.name === REFRESH_COOKIE)!;
    expect(access).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax' });
    expect(refresh).toMatchObject({ httpOnly: true, path: '/api/auth', sameSite: 'Lax' });
    expect(access.value.split('.')).toHaveLength(3); // JWT
  });

  it('me works with access cookie, 401 without', async () => {
    const { access } = await signup();
    expect((await get('/api/auth/me', access)).json()).toMatchObject({ username: 'alice' });
    expect((await get('/api/auth/me')).statusCode).toBe(401);
    expect((await get('/api/auth/me', `${ACCESS_COOKIE}=garbage`)).statusCode).toBe(401);
  });

  it('login needs only username+password; wrong password is 401', async () => {
    await signup();
    const ok = await post('/api/auth/login', { username: 'alice', password: 'secret123' });
    expect(ok.statusCode).toBe(200);
    expect(cookieVal(ok, REFRESH_COOKIE)).toBeTruthy();
    expect((await post('/api/auth/login', { username: 'alice', password: 'wrong-pass' })).statusCode).toBe(401);
  });

  it('expired access token → 401, refresh gives a new working one', async () => {
    const first = await signupUser(app, 'alice');
    const me = first.json();
    const expired = await signAccess(app.jwtSecret, { userId: me.id, role: 'member', ver: 0 }, -10);
    expect((await get('/api/auth/me', `${ACCESS_COOKIE}=${expired}`)).statusCode).toBe(401);

    const refreshed = await post('/api/auth/refresh', undefined, jar(first).refresh);
    expect(refreshed.statusCode).toBe(200);
    const next = jar(refreshed);
    expect(next.refresh).not.toBe(jar(first).refresh); // ротация
    expect((await get('/api/auth/me', next.access)).statusCode).toBe(200);
  });

  it('JWT signed with another secret or tampered is rejected', async () => {
    const res = await signupUser(app, 'alice');
    const forged = await signAccess('x'.repeat(40), { userId: res.json().id, role: 'admin', ver: 0 });
    expect((await get('/api/auth/me', `${ACCESS_COOKIE}=${forged}`)).statusCode).toBe(401);
  });

  it('refresh without cookie / with garbage is 401', async () => {
    expect((await post('/api/auth/refresh')).statusCode).toBe(401);
    expect((await post('/api/auth/refresh', undefined, `${REFRESH_COOKIE}=nope`)).statusCode).toBe(401);
  });

  it('reusing an old refresh token after the grace window kills the whole chain', async () => {
    const first = jar(await signupUser(app, 'alice'));
    const second = jar(await post('/api/auth/refresh', undefined, first.refresh));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + ROTATION_GRACE_MS + 1000);

    // кто-то предъявил уже ротированный токен → отказ и отзыв цепочки
    expect((await post('/api/auth/refresh', undefined, first.refresh)).statusCode).toBe(401);
    // легитимный «текущий» токен теперь тоже мёртв
    expect((await post('/api/auth/refresh', undefined, second.refresh)).statusCode).toBe(401);
  });

  it('parallel refresh from another tab (within grace) gets an access token without rotating again', async () => {
    const first = jar(await signupUser(app, 'alice'));
    const a = await post('/api/auth/refresh', undefined, first.refresh);
    const b = await post('/api/auth/refresh', undefined, first.refresh);
    expect(b.statusCode).toBe(200);
    expect(cookieVal(b, REFRESH_COOKIE)).toBeUndefined();
    expect((await get('/api/auth/me', jar(b).access)).statusCode).toBe(200);
    // цепочка жива: токен из ответа `a` продолжает работать
    expect((await post('/api/auth/refresh', undefined, jar(a).refresh)).statusCode).toBe(200);
  });

  it('logout revokes the refresh chain and clears cookies', async () => {
    const j = jar(await signupUser(app, 'alice'));
    const out = await post('/api/auth/logout', undefined, j.both);
    expect(out.statusCode).toBe(204);
    expect(out.cookies.map((c) => c.name).sort()).toEqual([ACCESS_COOKIE, REFRESH_COOKIE].sort());
    expect((await post('/api/auth/refresh', undefined, j.refresh)).statusCode).toBe(401);
  });

  it('logout-all invalidates already issued access tokens immediately and all refresh tokens', async () => {
    const d1 = jar(await signupUser(app, 'alice'));
    const d2 = jar(await post('/api/auth/login', { username: 'alice', password: 'secret123' }));
    expect((await post('/api/auth/logout-all', undefined, d1.access)).statusCode).toBe(204);
    expect((await get('/api/auth/me', d2.access)).statusCode).toBe(401);
    expect((await post('/api/auth/refresh', undefined, d2.refresh)).statusCode).toBe(401);
  });

  it('blocked user: login, existing access and refresh all stop working', async () => {
    const j = jar(await signupUser(app, 'alice'));
    await app.db.update(users).set({ isActive: false }).where(eq(users.username, 'alice'));
    expect((await get('/api/auth/me', j.access)).statusCode).toBe(401);
    expect((await post('/api/auth/refresh', undefined, j.refresh)).statusCode).toBe(401);
    expect((await post('/api/auth/login', { username: 'alice', password: 'secret123' })).statusCode).toBe(401);
  });

  it('role change via token_version bump is picked up (stale token rejected)', async () => {
    const j = jar(await signupUser(app, 'alice'));
    await app.db.update(users).set({ role: 'admin', tokenVersion: 1 }).where(eq(users.username, 'alice'));
    expect((await get('/api/auth/me', j.access)).statusCode).toBe(401);
    const re = await post('/api/auth/refresh', undefined, j.refresh);
    expect(re.json()).toMatchObject({ role: 'admin' });
  });

  it('refresh tokens are stored hashed, never raw', async () => {
    const j = await signupUser(app, 'alice');
    const raw = cookieVal(j, REFRESH_COOKIE)!;
    const rows = await app.db.select().from(refreshTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks a login after too many failures for the same ip+user, and a success resets the counter', async () => {
    await app.close();
    await start({ loginFailMax: 3 });
    await signup();
    const bad = () => post('/api/auth/login', { username: 'alice', password: 'wrong-pass' });
    expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(401);
    expect((await post('/api/auth/login', { username: 'alice', password: 'secret123' })).statusCode).toBe(200); // сброс
    for (let i = 0; i < 3; i++) expect((await bad()).statusCode).toBe(401);
    const locked = await post('/api/auth/login', { username: 'alice', password: 'secret123' }); // даже верный пароль
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rate-limits auth endpoints per ip', async () => {
    await app.close();
    await start({ authRateLimitMax: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await post('/api/auth/login', { username: 'nobody', password: 'wrong-pass' })).statusCode);
    expect(codes).toEqual([401, 401, 429, 429]);
  });

  it('CSRF: mutating request from a foreign Origin is blocked, same-origin allowed', async () => {
    const j = await signup();
    const evil = await post('/api/boards', { name: 'x' }, j.access, { origin: 'https://evil.example', host: 'localhost:3100' });
    expect(evil.statusCode).toBe(403);
    const same = await post('/api/boards', { name: 'x' }, j.access, { origin: 'http://localhost:3100', host: 'localhost:3100' });
    expect(same.statusCode).toBe(201);
  });

  it('ensureAdmin: creates the first admin from config, and promotes an existing user', async () => {
    await app.close();
    await start({ adminUsername: 'root', adminPassword: 'rootpass1', adminEmail: 'root@example.com' });
    const login = await post('/api/auth/login', { username: 'root', password: 'rootpass1' });
    expect(login.json()).toMatchObject({ role: 'owner', email: 'root@example.com' });

    await signup();
    await app.db.update(users).set({ role: 'member' }).where(eq(users.username, 'root'));
    const log = { info: () => {}, warn: () => {} };
    await ensureAdmin(app.db, loadConfig({ adminUsername: 'alice' }), log);
    const [alice] = await app.db.select().from(users).where(eq(users.username, 'alice'));
    expect(alice!.role).toBe('owner');
  });

  it('ensureAdmin does nothing when an admin already exists', async () => {
    await app.close();
    await start({ adminUsername: 'root', adminPassword: 'rootpass1' });
    await signup();
    await ensureAdmin(app.db, loadConfig({ adminUsername: 'alice' }), { info: () => {}, warn: () => {} });
    const [alice] = await app.db.select().from(users).where(eq(users.username, 'alice'));
    expect(alice!.role).toBe('member');
  });
});
