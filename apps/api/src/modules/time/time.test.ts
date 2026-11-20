import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, duePayoutPeriods, payoutDueDate, periodTitle, resolvePeriod } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { timeEntries } from '../../db/schema';
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
    // «к выплате» — текущая половина месяца
    expect(resolvePeriod('payout', '2026-11-09')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(resolvePeriod('payout', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(resolvePeriod('payout', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-30' });
    expect(resolvePeriod('payout', '2026-02-20')).toEqual({ from: '2026-02-16', to: '2026-02-28' });
    expect(resolvePeriod('last14', '2026-03-05')).toEqual({ from: '2026-02-20', to: '2026-03-05' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('payout due dates: 1–15 on the 15th, 16–end on the 1st of next month', () => {
    expect(payoutDueDate('2026-11-01', '2026-11-15')).toBe('2026-11-15');
    expect(payoutDueDate('2026-11-16', '2026-11-30')).toBe('2026-12-01');
    expect(payoutDueDate('2026-12-16', '2026-12-31')).toBe('2027-01-01');
    expect(payoutDueDate('2026-11-03', '2026-11-07')).toBeNull();
    expect(payoutDueDate('2026-11-01', '2026-11-30')).toBeNull();
    // 9 ноября: наступил срок только 16–31 октября (1 ноября), 1–15 ноября ещё копится
    expect(duePayoutPeriods('2026-11-09', 2)).toEqual([
      { from: '2026-10-16', to: '2026-10-31', due: '2026-11-01' },
      { from: '2026-10-01', to: '2026-10-15', due: '2026-10-15' },
    ]);
    expect(duePayoutPeriods('2026-11-15', 1)).toEqual([{ from: '2026-11-01', to: '2026-11-15', due: '2026-11-15' }]);
  });
  it('period titles name the month and half', () => {
    expect(periodTitle('2026-11-01', '2026-11-15')).toBe('за ноябрь 2026, 1–15');
    expect(periodTitle('2026-11-16', '2026-11-30')).toBe('за ноябрь 2026, 16–30');
    expect(periodTitle('2026-02-16', '2026-02-28')).toBe('за февраль 2026, 16–28');
    expect(periodTitle('2026-11-01', '2026-11-30')).toBe('за ноябрь 2026');
    expect(periodTitle('2026-11-03', '2026-11-07')).toBe('03.11.2026 – 07.11.2026');
    expect(periodTitle('2026-11-07', '2026-11-07')).toBe('07.11.2026');
  });
});

describe('work timer', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let root: U, a: U, b: U;
  const call = (u: U | undefined, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: u ? { cookie: u.cookie } : {} });
  const mk = async (name: string, role: 'owner' | 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', timeZone: 'Europe/Moscow' }), { logger: false });
    await app.ready();
    root = await mk('rootadm', 'owner');
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
    expect((await call(a, 'PUT', '/api/admin/time/settings', { currency: '$' })).statusCode).toBe(403);
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

  it('after stop the state remembers the last task for "continue"', async () => {
    // у нового пользователя помнить нечего
    expect((await call(a, 'GET', '/api/time/state')).json().last).toBeNull();

    const board = (await call(a, 'POST', '/api/boards', { name: 'B' })).json();
    const full = (await call(a, 'GET', `/api/boards/${board.id}`)).json();
    const task = (await call(a, 'POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 'Верстка' })).json();

    await call(a, 'POST', '/api/time/start', { taskId: task.id, note: 'шапка', startedAt: iso(-20 * MIN) });
    const running = (await call(a, 'GET', '/api/time/state')).json();
    expect(running.last).toBeNull();

    const stopped = (await call(a, 'POST', '/api/time/stop', {})).json();
    expect(stopped.status).toBe('idle');
    expect(stopped.last).toEqual({ taskId: task.id, taskNumber: task.number, taskTitle: 'Верстка', boardId: board.id, note: 'шапка' });
    // и после перезагрузки страницы
    expect((await call(a, 'GET', '/api/time/state')).json().last).toMatchObject({ taskId: task.id, note: 'шапка' });
    // продолжение по этой же задаче
    expect((await call(a, 'POST', '/api/time/start', { taskId: task.id, note: 'шапка' })).json().status).toBe('running');
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

    expect((await call(root, 'PUT', '/api/admin/time/settings', { currency: 'USD' })).statusCode).toBe(200);
    expect((await call(root, 'PUT', `/api/admin/users/${a.id}/rate`, { hourlyRate: 20 })).statusCode).toBe(200);

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

  it('admin report by projects: boards, people, tasks; work without a task is separate', async () => {
    const mkTask = async (boardName: string, title: string) => {
      const board = (await call(root, 'POST', '/api/boards', { name: boardName })).json();
      const full = (await call(root, 'GET', `/api/boards/${board.id}`)).json();
      for (const u of [a, b]) await call(root, 'PUT', `/api/boards/${board.id}/members/${u.id}`, { role: 'editor' });
      const t = (await call(root, 'POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title })).json();
      return { board, task: t };
    };
    const alpha = await mkTask('Alpha', 'A1');
    const beta = await mkTask('Beta', 'B1');
    const add = (u: U, from: number, to: number, body: object) =>
      call(u, 'POST', '/api/time/entries', { ...body, startedAt: iso(from), endedAt: iso(to) });
    expect((await add(a, -300 * MIN, -240 * MIN, { taskId: alpha.task.id })).statusCode).toBe(200); // a: Alpha 60 мин
    expect((await add(b, -230 * MIN, -200 * MIN, { taskId: alpha.task.id })).statusCode).toBe(200); // b: Alpha 30 мин
    expect((await add(a, -190 * MIN, -130 * MIN, { taskId: beta.task.id })).statusCode).toBe(200); // a: Beta 60 мин
    expect((await add(a, -120 * MIN, -100 * MIN, { note: 'созвон' })).statusCode).toBe(200); // без задачи 20 мин

    await call(root, 'PUT', '/api/admin/time/settings', { currency: 'USD' });
    for (const u of [a, b]) await call(root, 'PUT', `/api/admin/users/${u.id}/rate`, { hourlyRate: 10 });
    const today = dayOf(Date.now(), 'Europe/Moscow');
    const q = `from=${addDays(today, -1)}&to=${today}`;
    const r = (await call(root, 'GET', `/api/admin/time/report?${q}`)).json();

    expect(r.projects.map((p: { name: string }) => p.name)).toEqual(['Alpha', 'Beta', '(без проекта)']);
    const [pa, pb, none] = r.projects;
    expect(pa).toMatchObject({ boardId: alpha.board.id, totalMs: 90 * MIN, amount: 15 });
    expect(pa.people.map((x: { username: string; ms: number }) => [x.username, x.ms])).toEqual([['worker1', 60 * MIN], ['worker2', 30 * MIN]]);
    expect(pa.items[0]).toMatchObject({ taskNumber: 1, label: 'A1', ms: 90 * MIN });
    expect(pb.totalMs).toBe(60 * MIN);
    expect(none).toMatchObject({ boardId: null, totalMs: 20 * MIN });
    // итог по проектам = итог по людям
    expect(r.projects.reduce((s: number, p: { totalMs: number }) => s + p.totalMs, 0)).toBe(r.totalMs);

    const csv = await call(root, 'GET', `/api/admin/time/report.csv?${q}&view=projects`);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-disposition']).toContain('time-projects-');
    expect(csv.body).toContain('Проект');
    expect(csv.body).toContain('Alpha — итого');
    expect(csv.body).toContain('ИТОГО');
  });

  it('payouts: due list, mark paid (snapshot), history, undo', async () => {
    const today = dayOf(Date.now(), 'Europe/Moscow');
    const [period, older] = duePayoutPeriods(today, 2) as [{ from: string; to: string; due: string }, { from: string; to: string; due: string }];
    const at = (day: string, h: number) => new Date(startOfDay(day, 'Europe/Moscow') + h * 60 * MIN).toISOString();
    // работа внутри наступившего периода, вставляем напрямую (ручные записи старше 14 дней API не принимает)
    await app.db.insert(timeEntries).values([
      { userId: a.id, note: 'x', startedAt: at(period.from, 10), endedAt: at(period.from, 12) }, // 2 часа
      { userId: b.id, note: 'y', startedAt: at(older.from, 10), endedAt: at(older.from, 11) }, // 1 час в прошлом периоде
    ]);
    await call(root, 'PUT', '/api/admin/time/settings', { currency: 'USD' });
    for (const u of [a, b]) await call(root, 'PUT', `/api/admin/users/${u.id}/rate`, { hourlyRate: 10 });

    // не выплачено при наступившем сроке: оба
    const due = (await call(root, 'GET', '/api/admin/time/payouts/due')).json();
    expect(due.map((d: { username: string; from: string }) => [d.username, d.from]).sort()).toEqual(
      [['worker1', period.from], ['worker2', older.from]].sort(),
    );

    // отчёт знает срок и статус
    const rep0 = (await call(root, 'GET', `/api/admin/time/report?from=${period.from}&to=${period.to}`)).json();
    expect(rep0.payoutDue).toBe(period.due);
    expect(rep0.users.find((u: { username: string }) => u.username === 'worker1').payout).toBeNull();

    // только админ; произвольный период и пустой период нельзя
    const body = { userId: a.id, from: period.from, to: period.to };
    expect((await call(a, 'POST', '/api/admin/time/payouts', body)).statusCode).toBe(403);
    expect((await call(root, 'POST', '/api/admin/time/payouts', { ...body, from: addDays(period.from, 1) })).statusCode).toBe(400);
    expect((await call(root, 'POST', '/api/admin/time/payouts', { ...body, userId: b.id })).statusCode).toBe(400); // у b в этом периоде нет часов
    // срок ещё не наступил — нельзя
    const future = resolvePeriod('payout', today);
    if (payoutDueDate(future.from, future.to)! > today) {
      expect((await call(root, 'POST', '/api/admin/time/payouts', { userId: a.id, ...future })).statusCode).toBe(400);
    }

    const ok = await call(root, 'POST', '/api/admin/time/payouts', { ...body, note: 'карта' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ username: 'worker1', ms: 120 * MIN, hourlyRate: 10, currency: 'USD', amount: 20, paidBy: 'rootadm', note: 'карта' });
    expect((await call(root, 'POST', '/api/admin/time/payouts', body)).statusCode).toBe(409); // повторно нельзя

    // ставку поменяли — выплаченное в истории не пересчитывается
    await call(root, 'PUT', `/api/admin/users/${a.id}/rate`, { hourlyRate: 50 });
    const hist = (await call(root, 'GET', '/api/admin/time/payouts')).json();
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ amount: 20, hourlyRate: 10 });

    // в отчёте у человека появился статус, в списке долгов он исчез
    const rep = (await call(root, 'GET', `/api/admin/time/report?from=${period.from}&to=${period.to}`)).json();
    expect(rep.users.find((u: { username: string }) => u.username === 'worker1').payout).toMatchObject({ id: hist[0].id, amount: 20 });
    const due2 = (await call(root, 'GET', '/api/admin/time/payouts/due')).json();
    expect(due2.map((d: { username: string }) => d.username)).toEqual(['worker2']);

    // отмена отметки
    expect((await call(root, 'DELETE', `/api/admin/time/payouts/${hist[0].id}`)).statusCode).toBe(204);
    expect((await call(root, 'GET', '/api/admin/time/payouts')).json()).toEqual([]);
    expect((await call(root, 'DELETE', `/api/admin/time/payouts/${hist[0].id}`)).statusCode).toBe(404);
    expect((await call(root, 'GET', '/api/admin/time/payouts/due')).json()).toHaveLength(2);
  });

  it('live view shows running and paused timers', async () => {
    await call(a, 'POST', '/api/time/start', { note: 'live-a' });
    await call(b, 'POST', '/api/time/start', { note: 'live-b' });
    await call(b, 'POST', '/api/time/pause');
    const live = (await call(root, 'GET', '/api/admin/time/live')).json();
    expect(live.map((x: { username: string; status: string }) => `${x.username}:${x.status}`)).toEqual(['worker1:running', 'worker2:paused']);
  });

  it('settings: default currency $ and validation; rate is per user', async () => {
    expect((await call(a, 'GET', '/api/time/settings')).json()).toMatchObject({ currency: '$', timeZone: 'Europe/Moscow' });
    expect((await call(root, 'PUT', '/api/admin/time/settings', { currency: '' })).statusCode).toBe(400);
    expect((await call(root, 'PUT', '/api/admin/time/settings', { currency: '€' })).statusCode).toBe(200);
    expect((await call(a, 'GET', '/api/time/settings')).json()).toMatchObject({ currency: '€' });
    expect((await call(root, 'PUT', `/api/admin/users/${a.id}/rate`, { hourlyRate: -1 })).statusCode).toBe(400);
    expect((await call(root, 'PUT', `/api/admin/users/${a.id}/rate`, { hourlyRate: 12.5 })).statusCode).toBe(200);
  });
});
