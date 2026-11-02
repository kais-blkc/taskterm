import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';

const creds = { username: 'alice', password: 'secret123', accessPassword: 'gate' };

describe('auth', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), {
      logger: false,
    });
    await app.ready();
  });
  afterEach(() => app.close());

  const post = (url: string, payload: unknown, cookie?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: cookie ? { cookie } : {} });
  const cookieOf = (res: Awaited<ReturnType<typeof post>>) =>
    `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;

  it('rejects wrong access password', async () => {
    const res = await post('/api/auth/register', { ...creds, accessPassword: 'nope' });
    expect(res.statusCode).toBe(401);
  });

  it('registers, returns me, logs out', async () => {
    const reg = await post('/api/auth/register', creds);
    expect(reg.statusCode).toBe(200);
    expect(reg.json()).toMatchObject({ username: 'alice' });
    const cookie = cookieOf(reg);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ username: 'alice' });

    await post('/api/auth/logout', {}, cookie);
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects duplicate username', async () => {
    await post('/api/auth/register', creds);
    const res = await post('/api/auth/register', creds);
    expect(res.statusCode).toBe(409);
  });

  it('login: ok and wrong password', async () => {
    await post('/api/auth/register', creds);
    expect((await post('/api/auth/login', creds)).statusCode).toBe(200);
    expect((await post('/api/auth/login', { ...creds, password: 'wrong-pass' })).statusCode).toBe(401);
  });

  it('me without cookie is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
