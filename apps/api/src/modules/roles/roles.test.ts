import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';
import { timeEntries } from '../../db/schema';

describe('роли: owner / admin / moderator, ставки сотрудников', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let owner: U, admin: U, admin2: U, mod: U, w: U;
  const call = (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const mk = async (name: string, role: 'owner' | 'admin' | 'moderator' | 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const rateOf = async (viewer: U, id: number) =>
    ((await call(viewer, 'GET', '/api/admin/users')).json() as { id: number; hourlyRate: number | null }[]).find((u) => u.id === id)!.hourlyRate;

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.ready();
    owner = await mk('boss', 'owner');
    admin = await mk('adm1', 'admin');
    admin2 = await mk('adm2', 'admin');
    mod = await mk('moder', 'moderator');
    w = await mk('worker', 'member');
  });
  afterEach(() => app.close());

  it('ставка у каждого своя: owner ставит любую, admin — только участникам и модераторам', async () => {
    expect((await call(owner, 'PUT', `/api/admin/users/${w.id}/rate`, { hourlyRate: 15 })).statusCode).toBe(200);
    expect((await call(owner, 'PUT', `/api/admin/users/${admin.id}/rate`, { hourlyRate: 40 })).statusCode).toBe(200);
    expect((await call(admin, 'PUT', `/api/admin/users/${mod.id}/rate`, { hourlyRate: 12 })).statusCode).toBe(200);
    expect((await call(admin, 'PUT', `/api/admin/users/${admin2.id}/rate`, { hourlyRate: 1 })).statusCode).toBe(403);
    expect((await call(admin, 'PUT', `/api/admin/users/${admin.id}/rate`, { hourlyRate: 1 })).statusCode).toBe(403); // себе — нет
    expect((await call(admin, 'PUT', `/api/admin/users/${owner.id}/rate`, { hourlyRate: 1 })).statusCode).toBe(403);
    expect((await call(mod, 'PUT', `/api/admin/users/${w.id}/rate`, { hourlyRate: 1 })).statusCode).toBe(403);
    expect(await rateOf(owner, w.id)).toBe(15);
  });

  it('видимость ставок: owner — все; admin — свою и участников/модераторов; moderator — никаких', async () => {
    await call(owner, 'PUT', `/api/admin/users/${owner.id}/rate`, { hourlyRate: 99 });
    await call(owner, 'PUT', `/api/admin/users/${admin2.id}/rate`, { hourlyRate: 30 });
    await call(owner, 'PUT', `/api/admin/users/${admin.id}/rate`, { hourlyRate: 25 });
    await call(owner, 'PUT', `/api/admin/users/${w.id}/rate`, { hourlyRate: 15 });
    expect(await rateOf(owner, owner.id)).toBe(99);
    expect(await rateOf(owner, admin2.id)).toBe(30);
    // admin: владельца и другого админа не видит
    expect(await rateOf(admin, owner.id)).toBeNull();
    expect(await rateOf(admin, admin2.id)).toBeNull();
    expect(await rateOf(admin, admin.id)).toBe(25);
    expect(await rateOf(admin, w.id)).toBe(15);
    // moderator: ставок нет вовсе
    expect(await rateOf(mod, w.id)).toBeNull();
    expect(await rateOf(mod, mod.id)).toBe(0); // свою — видит
  });

  it('модератор не видит время: отчёты, live, выплаты, настройки — 403; админ не видит часы владельца и других админов', async () => {
    for (const url of ['/api/admin/time/live', '/api/admin/time/report?from=2026-11-01&to=2026-11-15', '/api/admin/time/payouts', '/api/admin/time/payouts/due', '/api/admin/audit', '/api/admin/notify-settings'])
      expect((await call(mod, 'GET', url)).statusCode, url).toBe(403);
    expect((await call(mod, 'PUT', '/api/admin/time/settings', { currency: '$' })).statusCode).toBe(403);

    const now = Date.now();
    const at = (ago: number) => new Date(now - ago * 60_000).toISOString();
    await app.db.insert(timeEntries).values([
      { userId: owner.id, note: 'o', startedAt: at(300), endedAt: at(240) },
      { userId: admin2.id, note: 'a2', startedAt: at(230), endedAt: at(200) },
      { userId: w.id, note: 'w', startedAt: at(190), endedAt: at(130) },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const names = async (u: U) =>
      ((await call(u, 'GET', `/api/admin/time/report?from=${today}&to=${today}`)).json().users as { username: string }[]).map((x) => x.username).sort();
    expect(await names(owner)).toEqual(['adm2', 'boss', 'worker']);
    expect(await names(admin)).toEqual(['worker']);
  });

  it('модератор: админка без ролей; блокирует и сбрасывает пароль только участникам', async () => {
    expect((await call(w, 'GET', '/api/admin/users')).statusCode).toBe(403); // обычный участник в админку не заходит
    expect((await call(mod, 'GET', '/api/admin/users')).statusCode).toBe(200);
    expect((await call(mod, 'GET', '/api/admin/boards')).statusCode).toBe(200);
    expect((await call(mod, 'PATCH', `/api/admin/users/${w.id}`, { role: 'admin' })).statusCode).toBe(403);
    expect((await call(mod, 'PATCH', `/api/admin/users/${w.id}`, { isActive: false })).statusCode).toBe(200);
    expect((await call(mod, 'PATCH', `/api/admin/users/${admin.id}`, { isActive: false })).statusCode).toBe(403);
    expect((await call(mod, 'POST', `/api/admin/users/${admin.id}/reset-password`)).statusCode).toBe(403);
    expect((await call(mod, 'DELETE', `/api/admin/users/${w.id}`, { transferTo: admin.id })).statusCode).toBe(403);
    // приглашает только участников
    expect((await call(mod, 'POST', '/api/invites', { email: 'x@example.com', role: 'admin', boards: [] })).statusCode).toBe(403);
    expect((await call(mod, 'POST', '/api/invites', { email: 'x@example.com', role: 'member', boards: [] })).statusCode).toBe(201);
  });

  it('владелец неприкосновенен: его не блокируют, не понижают и не удаляют; роль owner выдать нельзя', async () => {
    expect((await call(admin, 'PATCH', `/api/admin/users/${owner.id}`, { isActive: false })).statusCode).toBe(403);
    expect((await call(admin, 'PATCH', `/api/admin/users/${owner.id}`, { role: 'member' })).statusCode).toBe(403);
    expect((await call(admin, 'DELETE', `/api/admin/users/${owner.id}`, { transferTo: admin.id })).statusCode).toBe(403);
    expect((await call(owner, 'PATCH', `/api/admin/users/${owner.id}`, { role: 'member' })).statusCode).toBe(400);
    expect((await call(owner, 'PATCH', `/api/admin/users/${w.id}`, { role: 'owner' })).statusCode).toBe(400);
    expect((await call(owner, 'PATCH', `/api/admin/users/${w.id}`, { role: 'moderator' })).statusCode).toBe(200);
  });

  it('админ видит админ-панель и время участников; свою ставку и часы видит каждый на /time', async () => {
    await call(owner, 'PUT', `/api/admin/users/${w.id}/rate`, { hourlyRate: 15 });
    expect((await call(admin, 'GET', '/api/admin/time/live')).statusCode).toBe(200);
    const mine = (await call(w, 'GET', '/api/time/entries?from=2026-11-01&to=2026-11-15')).json();
    expect(mine.hourlyRate).toBe(15);
  });
});
