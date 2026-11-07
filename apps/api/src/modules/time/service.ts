import { and, asc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  addDays,
  amountFor,
  type LiveTimer,
  type MyEntries,
  type ReportUser,
  type TimeEntry,
  type TimeReport,
  type TimerSettings,
  type TimerState,
  type UpdateTimerSettings,
} from '@taskterm/shared';
import { first, type Db } from '../../db/client';
import { appSettings, tasks, timeEntries, users, workTimers } from '../../db/schema';
import type { AuthUser } from '../auth/service';
import { requireTaskCan } from '../permissions/access';
import { dayOf, startOfDay } from './tz';

export class TimeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Насколько назад можно «запустить задним числом» */
const MAX_BACKDATE_MS = 14 * 24 * 3600_000;
/** Допуск на расхождение часов клиента и сервера */
const FUTURE_SLACK_MS = 60_000;

const DEFAULT_RATE = 10;
const DEFAULT_CURRENCY = '$';

// ---------- настройки ----------

export async function getSettings(db: Db, timeZone: string): Promise<TimerSettings> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, ['time.rate', 'time.currency']));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rate = Number(map.get('time.rate'));
  return {
    hourlyRate: Number.isFinite(rate) && map.has('time.rate') ? rate : DEFAULT_RATE,
    currency: map.get('time.currency') ?? DEFAULT_CURRENCY,
    timeZone,
  };
}

export async function saveSettings(db: Db, input: UpdateTimerSettings, timeZone: string): Promise<TimerSettings> {
  const upsert = (key: string, value: string) =>
    db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  await upsert('time.rate', String(input.hourlyRate));
  await upsert('time.currency', input.currency.trim());
  return getSettings(db, timeZone);
}

// ---------- проверки ----------

const ms = (iso: string) => new Date(iso).getTime();

function checkRange(startMs: number, endMs: number, nowMs: number) {
  if (endMs <= startMs) throw new TimeError('конец должен быть позже начала');
  if (endMs > nowMs + FUTURE_SLACK_MS) throw new TimeError('время не может быть в будущем');
}

function checkStart(startMs: number, nowMs: number) {
  if (startMs > nowMs + FUTURE_SLACK_MS) throw new TimeError('время начала не может быть в будущем');
  if (startMs < nowMs - MAX_BACKDATE_MS) throw new TimeError('начало слишком давно (не больше 14 дней назад)');
}

/** Пересекается ли интервал с другими записями пользователя (идущая запись считается до «сейчас» и дальше) */
async function overlaps(db: Db, userId: number, startMs: number, endMs: number, excludeId?: number): Promise<boolean> {
  const rows = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        excludeId ? sql`${timeEntries.id} <> ${excludeId}` : undefined,
        lt(timeEntries.startedAt, new Date(endMs).toISOString()),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, new Date(startMs).toISOString())),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function assertNoOverlap(db: Db, userId: number, startMs: number, endMs: number, excludeId?: number) {
  if (await overlaps(db, userId, startMs, endMs, excludeId)) {
    throw new TimeError('это время пересекается с другой вашей записью', 409);
  }
}

async function checkTask(db: Db, user: AuthUser, taskId: number | null | undefined) {
  if (taskId == null) return;
  await requireTaskCan(db, user, taskId, 'view');
}

// ---------- таймер ----------

const taskCols = { taskId: tasks.id, taskNumber: tasks.number, taskTitle: tasks.title, boardId: tasks.boardId };

async function taskInfo(db: Db, taskId: number | null) {
  if (taskId == null) return { taskId: null, taskNumber: null, taskTitle: null, boardId: null };
  const t = first(await db.select(taskCols).from(tasks).where(eq(tasks.id, taskId)));
  return t ?? { taskId: null, taskNumber: null, taskTitle: null, boardId: null };
}

async function closedMsOf(db: Db, userId: number, since: string): Promise<number> {
  const rows = await db
    .select({ s: timeEntries.startedAt, e: timeEntries.endedAt })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), gte(timeEntries.startedAt, since), sql`${timeEntries.endedAt} is not null`));
  return rows.reduce((acc, r) => acc + Math.max(0, ms(r.e!) - ms(r.s)), 0);
}

async function openEntry(db: Db, userId: number) {
  return first(await db.select().from(timeEntries).where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt))));
}

export async function getState(db: Db, userId: number): Promise<TimerState> {
  const nowMs = Date.now();
  const timer = first(await db.select().from(workTimers).where(eq(workTimers.userId, userId)));
  if (!timer) {
    return {
      status: 'idle',
      ...(await taskInfo(db, null)),
      note: '',
      segmentStartedAt: null,
      closedMs: 0,
      startedAt: null,
      now: new Date(nowMs).toISOString(),
    };
  }
  const open = timer.status === 'running' ? await openEntry(db, userId) : undefined;
  return {
    status: timer.status,
    ...(await taskInfo(db, timer.taskId)),
    note: timer.note,
    segmentStartedAt: open?.startedAt ?? null,
    closedMs: await closedMsOf(db, userId, timer.startedAt),
    startedAt: timer.startedAt,
    now: new Date(nowMs).toISOString(),
  };
}

export async function startTimer(
  db: Db,
  user: AuthUser,
  input: { taskId?: number | null; note: string; startedAt?: string },
): Promise<TimerState> {
  const nowMs = Date.now();
  const startMs = input.startedAt ? ms(input.startedAt) : nowMs;
  checkStart(startMs, nowMs);
  await checkTask(db, user, input.taskId);

  if (first(await db.select().from(workTimers).where(eq(workTimers.userId, user.id)))) {
    throw new TimeError('таймер уже запущен', 409);
  }
  await assertNoOverlap(db, user.id, startMs, Math.max(nowMs, startMs + 1));

  const startedAt = new Date(startMs).toISOString();
  await db.transaction(async (tx) => {
    await tx.insert(workTimers).values({
      userId: user.id,
      taskId: input.taskId ?? null,
      note: input.note,
      status: 'running',
      startedAt,
    });
    await tx.insert(timeEntries).values({
      userId: user.id,
      taskId: input.taskId ?? null,
      note: input.note,
      startedAt,
      edited: !!input.startedAt && nowMs - startMs > FUTURE_SLACK_MS,
    });
  });
  return getState(db, user.id);
}

/** Закрыть открытый отрезок; endedAt — «сейчас» или время, заданное вручную */
async function closeOpen(db: Db, userId: number, endedAt?: string) {
  const open = await openEntry(db, userId);
  if (!open) return;
  const nowMs = Date.now();
  const endMs = endedAt ? ms(endedAt) : nowMs;
  const startMs = ms(open.startedAt);
  checkRange(startMs, endMs, nowMs);
  // отрезка нулевой длины не бывает: слишком короткий (двойной клик) просто удаляем
  await db
    .update(timeEntries)
    .set({ endedAt: new Date(endMs).toISOString(), edited: open.edited || (!!endedAt && nowMs - endMs > FUTURE_SLACK_MS) })
    .where(eq(timeEntries.id, open.id));
}

export async function pauseTimer(db: Db, userId: number): Promise<TimerState> {
  const timer = first(await db.select().from(workTimers).where(eq(workTimers.userId, userId)));
  if (!timer) throw new TimeError('таймер не запущен', 409);
  if (timer.status === 'paused') return getState(db, userId);
  await db.transaction(async (tx) => {
    await closeOpen(tx as unknown as Db, userId);
    await tx.update(workTimers).set({ status: 'paused' }).where(eq(workTimers.userId, userId));
  });
  return getState(db, userId);
}

export async function resumeTimer(db: Db, userId: number): Promise<TimerState> {
  const timer = first(await db.select().from(workTimers).where(eq(workTimers.userId, userId)));
  if (!timer) throw new TimeError('таймер не запущен', 409);
  if (timer.status === 'running') return getState(db, userId);
  const nowMs = Date.now();
  await assertNoOverlap(db, userId, nowMs, nowMs + 1);
  await db.transaction(async (tx) => {
    await tx.insert(timeEntries).values({
      userId,
      taskId: timer.taskId,
      note: timer.note,
      startedAt: new Date(nowMs).toISOString(),
    });
    await tx.update(workTimers).set({ status: 'running' }).where(eq(workTimers.userId, userId));
  });
  return getState(db, userId);
}

export async function stopTimer(db: Db, userId: number, endedAt?: string): Promise<TimerState> {
  const timer = first(await db.select().from(workTimers).where(eq(workTimers.userId, userId)));
  if (!timer) throw new TimeError('таймер не запущен', 409);
  await db.transaction(async (tx) => {
    await closeOpen(tx as unknown as Db, userId, endedAt);
    await tx.delete(workTimers).where(eq(workTimers.userId, userId));
  });
  return getState(db, userId);
}

// ---------- записи ----------

const entryCols = {
  id: timeEntries.id,
  taskId: timeEntries.taskId,
  note: timeEntries.note,
  startedAt: timeEntries.startedAt,
  endedAt: timeEntries.endedAt,
  edited: timeEntries.edited,
  taskNumber: tasks.number,
  taskTitle: tasks.title,
  boardId: tasks.boardId,
};

function toEntry(r: {
  id: number;
  taskId: number | null;
  note: string;
  startedAt: string;
  endedAt: string | null;
  edited: boolean;
  taskNumber: number | null;
  taskTitle: string | null;
  boardId: number | null;
}): TimeEntry {
  return {
    ...r,
    durationMs: Math.max(0, (r.endedAt ? ms(r.endedAt) : Date.now()) - ms(r.startedAt)),
  };
}

export function periodBounds(from: string, to: string, tz: string) {
  if (from > to) throw new TimeError('начало периода позже конца');
  if (to > addDays(from, 400)) throw new TimeError('период слишком длинный');
  return { startMs: startOfDay(from, tz), endMs: startOfDay(addDays(to, 1), tz) };
}

/** Записи, пересекающиеся с периодом, обрезанные по его границам */
async function clippedSegments(db: Db, startMs: number, endMs: number, userId?: number) {
  const rows = await db
    .select({
      userId: timeEntries.userId,
      taskId: timeEntries.taskId,
      note: timeEntries.note,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(
      and(
        userId ? eq(timeEntries.userId, userId) : undefined,
        lt(timeEntries.startedAt, new Date(endMs).toISOString()),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, new Date(startMs).toISOString())),
      ),
    )
    .orderBy(asc(timeEntries.startedAt));
  const nowMs = Date.now();
  return rows
    .map((r) => ({
      ...r,
      s: Math.max(ms(r.startedAt), startMs),
      e: Math.min(r.endedAt ? ms(r.endedAt) : nowMs, endMs),
    }))
    .filter((r) => r.e > r.s);
}

export async function myEntries(db: Db, userId: number, from: string, to: string, settings: TimerSettings): Promise<MyEntries> {
  const { startMs, endMs } = periodBounds(from, to, settings.timeZone);
  const rows = await db
    .select(entryCols)
    .from(timeEntries)
    .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(
      and(
        eq(timeEntries.userId, userId),
        lt(timeEntries.startedAt, new Date(endMs).toISOString()),
        or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, new Date(startMs).toISOString())),
      ),
    )
    .orderBy(asc(timeEntries.startedAt));
  const entries = rows.map(toEntry);
  // итог — только часть, попавшая в период (запись через полночь границы может быть обрезана)
  const nowMs = Date.now();
  const totalMs = entries.reduce(
    (acc, e) => acc + Math.max(0, Math.min(e.endedAt ? ms(e.endedAt) : nowMs, endMs) - Math.max(ms(e.startedAt), startMs)),
    0,
  );
  return { from, to, entries, totalMs, amount: amountFor(totalMs, settings.hourlyRate), hourlyRate: settings.hourlyRate, currency: settings.currency };
}

async function getOwnEntry(db: Db, userId: number, id: number) {
  const e = first(await db.select().from(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId))));
  if (!e) throw new TimeError('запись не найдена', 404);
  return e;
}

async function entryById(db: Db, id: number): Promise<TimeEntry> {
  const r = first(await db.select(entryCols).from(timeEntries).leftJoin(tasks, eq(tasks.id, timeEntries.taskId)).where(eq(timeEntries.id, id)));
  return toEntry(r!);
}

/** Запись за прошедшее время вручную: «забыл запустить таймер» */
export async function createEntry(
  db: Db,
  user: AuthUser,
  input: { taskId?: number | null; note: string; startedAt: string; endedAt: string },
): Promise<TimeEntry> {
  const nowMs = Date.now();
  const startMs = ms(input.startedAt);
  const endMs = ms(input.endedAt);
  checkRange(startMs, endMs, nowMs);
  checkStart(startMs, nowMs);
  await checkTask(db, user, input.taskId);
  await assertNoOverlap(db, user.id, startMs, endMs);
  const [row] = await db
    .insert(timeEntries)
    .values({
      userId: user.id,
      taskId: input.taskId ?? null,
      note: input.note,
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      edited: true,
    })
    .returning({ id: timeEntries.id });
  return entryById(db, row!.id);
}

export async function updateEntry(
  db: Db,
  user: AuthUser,
  id: number,
  input: { taskId?: number | null; note?: string; startedAt?: string; endedAt?: string },
): Promise<{ entry: TimeEntry; before: TimeEntry }> {
  const cur = await getOwnEntry(db, user.id, id);
  const before = await entryById(db, id);
  const nowMs = Date.now();
  const open = cur.endedAt == null;
  if (open && input.endedAt) throw new TimeError('идущую запись остановите кнопкой stop');

  const startMs = input.startedAt ? ms(input.startedAt) : ms(cur.startedAt);
  const endMs = open ? nowMs : input.endedAt ? ms(input.endedAt) : ms(cur.endedAt!);
  const taskId = input.taskId === undefined ? cur.taskId : input.taskId;
  const note = input.note ?? cur.note;
  if (taskId == null && !note) throw new TimeError('укажите задачу или описание');

  if (input.startedAt) checkStart(startMs, nowMs);
  if (!open) checkRange(startMs, endMs, nowMs);
  else if (startMs >= nowMs) throw new TimeError('начало должно быть раньше текущего момента');
  if (input.taskId !== undefined && input.taskId !== cur.taskId) await checkTask(db, user, input.taskId);
  if (input.startedAt || input.endedAt) await assertNoOverlap(db, user.id, startMs, endMs, id);

  await db
    .update(timeEntries)
    .set({
      taskId,
      note,
      startedAt: new Date(startMs).toISOString(),
      endedAt: open ? null : new Date(endMs).toISOString(),
      edited: true,
    })
    .where(eq(timeEntries.id, id));
  // описание идущего запуска синхронизируем: оно показывается в виджете
  if (open) await db.update(workTimers).set({ taskId, note }).where(eq(workTimers.userId, user.id));
  return { entry: await entryById(db, id), before };
}

export async function deleteEntry(db: Db, userId: number, id: number): Promise<TimeEntry> {
  const cur = await getOwnEntry(db, userId, id);
  if (cur.endedAt == null) throw new TimeError('идущую запись нельзя удалить: сначала остановите таймер', 409);
  const before = await entryById(db, id);
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  return before;
}

// ---------- админ ----------

export async function liveTimers(db: Db): Promise<LiveTimer[]> {
  const nowMs = Date.now();
  const rows = await db
    .select({
      userId: workTimers.userId,
      username: users.username,
      color: users.color,
      status: workTimers.status,
      note: workTimers.note,
      startedAt: workTimers.startedAt,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(workTimers)
    .innerJoin(users, eq(users.id, workTimers.userId))
    .leftJoin(tasks, eq(tasks.id, workTimers.taskId))
    .orderBy(asc(users.username));
  const out: LiveTimer[] = [];
  for (const r of rows) {
    const open = r.status === 'running' ? await openEntry(db, r.userId) : undefined;
    out.push({
      userId: r.userId,
      username: r.username,
      color: r.color,
      status: r.status,
      label: r.taskTitle ? `#${r.taskNumber} ${r.taskTitle}${r.note ? ` — ${r.note}` : ''}` : r.note,
      closedMs: await closedMsOf(db, r.userId, r.startedAt),
      segmentStartedAt: open?.startedAt ?? null,
      now: new Date(nowMs).toISOString(),
    });
  }
  return out;
}

/** Отчёт по всем (или одному) пользователям за период [from, to] включительно, в часовом поясе приложения */
export async function buildReport(db: Db, from: string, to: string, settings: TimerSettings, userId?: number): Promise<TimeReport> {
  const tz = settings.timeZone;
  const { startMs, endMs } = periodBounds(from, to, tz);
  const segs = await clippedSegments(db, startMs, endMs, userId);

  const acc = new Map<number, { days: Map<string, number>; items: Map<string, { taskId: number | null; taskNumber: number | null; label: string; ms: number }>; running: boolean }>();
  for (const s of segs) {
    let u = acc.get(s.userId);
    if (!u) acc.set(s.userId, (u = { days: new Map(), items: new Map(), running: false }));
    if (!s.endedAt) u.running = true;

    // делим по границам суток в поясе приложения
    let cur = s.s;
    while (cur < s.e) {
      const day = dayOf(cur, tz);
      const next = Math.min(s.e, startOfDay(addDays(day, 1), tz));
      u.days.set(day, (u.days.get(day) ?? 0) + (next - cur));
      cur = next;
    }

    const key = s.taskId != null ? `t${s.taskId}` : `n${s.note}`;
    const label = s.taskTitle != null ? s.taskTitle : s.note || '(без описания)';
    const item = u.items.get(key) ?? { taskId: s.taskId, taskNumber: s.taskNumber, label, ms: 0 };
    item.ms += s.e - s.s;
    u.items.set(key, item);
  }

  const ids = [...acc.keys()];
  const people = ids.length ? await db.select({ id: users.id, username: users.username, color: users.color }).from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));

  const reportUsers: ReportUser[] = ids
    .map((id) => {
      const u = acc.get(id)!;
      const p = byId.get(id);
      const totalMs = [...u.days.values()].reduce((a, b) => a + b, 0);
      return {
        userId: id,
        username: p?.username ?? `#${id}`,
        color: p?.color ?? '',
        totalMs,
        amount: amountFor(totalMs, settings.hourlyRate),
        running: u.running,
        days: [...u.days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ms: v })),
        items: [...u.items.values()].sort((a, b) => b.ms - a.ms),
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  const totalMs = reportUsers.reduce((a, u) => a + u.totalMs, 0);
  return {
    from,
    to,
    timeZone: tz,
    hourlyRate: settings.hourlyRate,
    currency: settings.currency,
    totalMs,
    totalAmount: amountFor(totalMs, settings.hourlyRate),
    users: reportUsers,
  };
}

const csvCell = (v: string | number) => {
  let s = String(v);
  // защита от формул в Excel/Sheets (описания вводят пользователи)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: человек; дата; часы; сумма — по дням, плюс итог по человеку */
export function reportToCsv(r: TimeReport): string {
  const lines = [['Сотрудник', 'Дата', 'Часы', `Сумма (${r.currency})`].map(csvCell).join(',')];
  const hours = (m: number) => (m / 3_600_000).toFixed(2);
  for (const u of r.users) {
    for (const d of u.days) lines.push([u.username, d.date, hours(d.ms), amountFor(d.ms, r.hourlyRate).toFixed(2)].map(csvCell).join(','));
    lines.push([`${u.username} — итого`, `${r.from}…${r.to}`, hours(u.totalMs), u.amount.toFixed(2)].map(csvCell).join(','));
  }
  lines.push(['ИТОГО', `${r.from}…${r.to}`, hours(r.totalMs), r.totalAmount.toFixed(2)].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
