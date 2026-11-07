import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, resolvePeriod } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';
import { dayOf, startOfDay } from './tz';

const MIN = 60_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('time tz / periods', () => {
  it('Moscow day boundaries (UTC+3)', () => {
    expect(new Date(startOfDay('2026-11-01', 'Europe/Moscow')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(dayOf(Date.parse('2026-11-15T21:30:00Z'), 'Europe/Moscow')).toBe('2026-11-16');
  });
  it('pay periods', () => {
    expect(resolvePeriod('half1', '2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(resolvePeriod('half2', '2026-02-20')).toEqual({ from: '2026-02-16', to: '2026-02-28' });
    expect(resolvePeriod('lastPaid', '2026-11-07')).toEqual({ from: '2026-10-16', to: '2026-10-31' });
    expect(resolvePeriod('lastPaid', '2026-01-03')).toEqual({ from: '2025-12-16', to: '2025-12-31' });
    expect(resolvePeriod('lastPaid', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(resolvePeriod('last14', '2026-03-05')).toEqual({ from: '2026-02-20', to: '2026-03-05' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('work timer', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let root: U, a: U, b: U;
  const call = (u: U | undefined, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const mk = async (name: string, role: 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', timeZone: 'Europe/Moscow' }), { logger: false });
    await app.ready();
    root = await mk('rootadm', 'admin');
    a = await mk('worker1');
    b = await mk('worker2');
  });
  afterEach(() => app.close());

  it('requires auth; admin routes are admin-only', async () => {
    expect((await call(undefined, 'GET', '/api/time/state')).statusCode).toBe(401);
    const q = '?from=2026-11-01&to=2026-11-15';
    for (const url of [`/api/admin/time/report${q}`, `/api/admin/time/report.csv${q}`, '/api/admin/time/live']) {
      expect((await call(a, 'GET', url)).statusCode, url).toBe(403);
    }
    expect((await call(a, 'PUT', '/api/admin/time/settings', { hourlyRate: 5, currency: '$' })).statusCode).toBe(403);
  });

  it('start needs a task or a description', async () => {
    expect((await call(a, 'POST', '/api/time/start', {})).statusCode).toBe(400);
    expect((await call(a, 'POST', '/api/time/start', { note: '   ' })).statusCode).toBe(400);
    const ok = await call(a, 'POST', '/api/time/start', { note: 'вёрстка' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('running');
  });

  it('one timer per user; pause/resume/stop flow', async () => {
    await call(a, 'POST', '/api/time/start', { note: 'x', startedAt: iso(-30 * MIN) });
    expect((await call(a, 'POST', '/api/time/start', { note: 'y' })).statusCode).toBe(409);
    // у другого пользователя свой таймер
    expect((await call(b, 'POST', '/api/time/start', { note: 'z' })).statusCode).toBe(200);

    const paused = (await call(a, 'POST', '/api/time/pause')).json();
    expect(paused.status).toBe('paused');
    expect(paused.closedMs).toBeGreaterThan(29 * MIN);
    expect(paused.segmentStartedAt).toBeNull();

    const resumed = (await call(a, 'POST', '/api/time/resume')).json();
    expect(resumed.status).toBe('running');
    expect(resumed.closedMs).toBeGreaterThan(29 * MIN);

    expect((await call(a, 'POST', '/api/time/stop', {})).json().status).toBe('idle');
    expect((await call(a, 'GET', '/api/time/state')).json().status).toBe('idle');
    const again = await call(a, 'POST', '/api/time/stop');
    expect(again.body).toContain('не запущен');
    expect(again.statusCode).toBe(409);
  });

  it('rejects future start, overlap and bad manual stop', async () => {
    expect((await call(a, 'POST', '/api/time/start', { note: 'x', startedAt: iso(10 * MIN) })).statusCode).toBe(400);
    await call(a, 'POST', '/api/time/start', { note: 'x', startedAt: iso(-60 * MIN) });
    // стоп «раньше начала»
    expect((await call(a, 'POST', '/api/time/stop', { endedAt: iso(-90 * MIN) })).statusCode).toBe(400);
    // стоп «40 минут назад» — ок
    const st = await call(a, 'POST', '/api/time/stop', { endedAt: iso(-40 * MIN) });
    expect(st.statusCode).toBe(200);
    // новый старт, пересекающийся с прошлой записью
    expect((await call(a, 'POST', '/api/time/start', { note: 'y', startedAt: iso(-50 * MIN) })).statusCode).toBe(409);
    expect((await call(a, 'POST', '/api/time/start', { note: 'y', startedAt: iso(-30 * MIN) })).statusCode).toBe(200);
  });

  it('manual entry, edit, delete — only own', async () => {
    const created = await call(a, 'POST', '/api/time/entries', { note: 'забыл', startedAt: iso(-120 * MIN), endedAt: iso(-60 * MIN) });
    expect(created.statusCode).toBe(200);
    const e = created.json();
    expect(Math.abs(e.durationMs - 60 * MIN)).toBeLessThan(1000);
    expect(e.edited).toBe(true);

    expect((await call(a, 'POST', '/api/time/entries', { note: 'dup', startedAt: iso(-90 * MIN), endedAt: iso(-70 * MIN) })).statusCode).toBe(409);
    expect((await call(b, 'PATCH', `/api/time/entries/${e.id}`, { note: 'hack' })).statusCode).toBe(404);
    expect((await call(b, 'DELETE', `/api/time/entries/${e.id}`)).statusCode).toBe(404);

    const upd = await call(a, 'PATCH', `/api/time/entries/${e.id}`, { endedAt: iso(-30 * MIN) });
    expect(Math.abs(upd.json().durationMs - 90 * MIN)).toBeLessThan(1000);

    // нельзя удалить идущую запись
    await call(a, 'POST', '/api/time/start', { note: 'live' });
    const live = (await call(a, 'GET', `/api/time/entries?from=${addDays(new Date().toISOString().slice(0, 10), -1)}&to=${addDays(new Date().toISOString().slice(0, 10), 1)}`)).json();
    const open = live.entries.find((x: { endedAt: string | null }) => x.endedAt === null);
    expect((await call(a, 'DELETE', `/api/time/entries/${open.id}`)).statusCode).toBe(409);

    expect((await call(a, 'DELETE', `/api/time/entries/${e.id}`)).statusCode).toBe(204);
  });

  it('admin report: clipped by period, split by Moscow day, amount by rate', async () => {
    // фиксируем запись относительно «сегодня по Москве»: 23:00–01:00 через полночь
    const today = dayOf(Date.now(), 'Europe/Moscow');
    const yesterday = addDays(today, -1);
    const s = startOfDay(today, 'Europe/Moscow') - 60 * MIN; // вчера 23:00
    const e = startOfDay(today, 'Europe/Moscow') + 60 * MIN; // сегодня 01:00
    if (Date.now() < e + MIN) return; // между 00:00 и 01:01 по Москве нельзя создать запись «в будущем»
    const c = await call(a, 'POST', '/api/time/entries', { note: 'ночь', startedAt: new Date(s).toISOString(), endedAt: new Date(e).toISOString() });
    expect(c.statusCode).toBe(200);

    expect((await call(root, 'PUT', '/api/admin/time/settings', { hourlyRate: 20, currency: 'USD' })).statusCode).toBe(200);

    const r = (await call(root, 'GET', `/api/admin/time/report?from=${yesterday}&to=${today}`)).json();
    expect(r.currency).toBe('USD');
    const u = r.users.find((x: { username: string }) => x.username === 'worker1');
    expect(u.totalMs).toBe(120 * MIN);
    expect(u.amount).toBe(40);
    expect(u.days).toEqual([
      { date: yesterday, ms: 60 * MIN },
      { date: today, ms: 60 * MIN },
    ]);
    expect(u.items[0].label).toBe('ночь');

    // период только «сегодня» — обрезка по границе суток
    const t = (await call(root, 'GET', `/api/admin/time/report?from=${today}&to=${today}`)).json();
    expect(t.users[0].totalMs).toBe(60 * MIN);

    const csv = await call(root, 'GET', `/api/admin/time/report.csv?from=${yesterday}&to=${today}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('worker1');
  });

  it('live view shows running and paused timers', async () => {
    await call(a, 'POST', '/api/time/start', { note: 'live-a' });
    await call(b, 'POST', '/api/time/start', { note: 'live-b' });
    await call(b, 'POST', '/api/time/pause');
    const live = (await call(root, 'GET', '/api/admin/time/live')).json();
    expect(live.map((x: { username: string; status: string }) => `${x.username}:${x.status}`)).toEqual(['worker1:running', 'worker2:paused']);
  });

  it('settings default 10 $ and validation', async () => {
    expect((await call(a, 'GET', '/api/time/settings')).json()).toMatchObject({ hourlyRate: 10, currency: '$', timeZone: 'Europe/Moscow' });
    expect((await call(root, 'PUT', '/api/admin/time/settings', { hourlyRate: -1, currency: '$' })).statusCode).toBe(400);
    expect((await call(root, 'PUT', '/api/admin/time/settings', { hourlyRate: 12.5, currency: '€' })).statusCode).toBe(200);
    expect((await call(a, 'GET', '/api/time/settings')).json()).toMatchObject({ hourlyRate: 12.5, currency: '€' });
  });
});
