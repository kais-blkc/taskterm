import { z } from 'zod';

/** Дата без времени `YYYY-MM-DD` (в часовом поясе приложения) */
export const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается дата YYYY-MM-DD');

const isoSchema = z.string().datetime({ offset: true });
const noteSchema = z.string().trim().max(500);

/** Текущий таймер пользователя. Работа хранится отрезками (entries): пауза закрывает отрезок, продолжение открывает новый. */
/** Над чем работали в последний раз (из последней закрытой записи): панель таймера предлагает продолжить */
export const lastTimerTaskSchema = z.object({
  taskId: z.number().int().nullable(),
  taskNumber: z.number().int().nullable(),
  taskTitle: z.string().nullable(),
  boardId: z.number().int().nullable(),
  note: z.string(),
});
export type LastTimerTask = z.infer<typeof lastTimerTaskSchema>;

export const timerStateSchema = z.object({
  status: z.enum(['idle', 'running', 'paused']),
  taskId: z.number().int().nullable(),
  taskNumber: z.number().int().nullable(),
  taskTitle: z.string().nullable(),
  boardId: z.number().int().nullable(),
  note: z.string(),
  /** начало открытого отрезка (только running) */
  segmentStartedAt: z.string().nullable(),
  /** сумма уже закрытых отрезков текущего запуска, мс */
  closedMs: z.number().int(),
  /** начало всего запуска */
  startedAt: z.string().nullable(),
  /** последняя задача после остановки (только idle), иначе null */
  last: lastTimerTaskSchema.nullable(),
  /** серверное «сейчас» — клиент поправляет сдвиг часов */
  now: z.string(),
});
export type TimerState = z.infer<typeof timerStateSchema>;

export const timerSettingsSchema = z.object({
  hourlyRate: z.number().min(0).max(1_000_000),
  currency: z.string().trim().min(1).max(8),
  timeZone: z.string(),
});
export type TimerSettings = z.infer<typeof timerSettingsSchema>;

export const updateTimerSettingsSchema = timerSettingsSchema.pick({ hourlyRate: true, currency: true });
export type UpdateTimerSettings = z.infer<typeof updateTimerSettingsSchema>;

/** Старт: задача или описание обязательны; startedAt — если забыли запустить (по умолчанию «сейчас») */
export const startTimerSchema = z
  .object({
    taskId: z.number().int().nullish(),
    note: noteSchema.default(''),
    startedAt: isoSchema.optional(),
  })
  .refine((v) => v.taskId != null || v.note.length > 0, { message: 'укажите задачу или опишите, над чем работаете', path: ['note'] });
export type StartTimerInput = z.input<typeof startTimerSchema>;

export const stopTimerSchema = z.object({ endedAt: isoSchema.optional() });

export const timeEntrySchema = z.object({
  id: z.number().int(),
  taskId: z.number().int().nullable(),
  taskNumber: z.number().int().nullable(),
  taskTitle: z.string().nullable(),
  boardId: z.number().int().nullable(),
  note: z.string(),
  startedAt: z.string(),
  /** null — идёт сейчас */
  endedAt: z.string().nullable(),
  /** длительность в мс (для идущего — до «сейчас») */
  durationMs: z.number().int(),
  /** правили вручную */
  edited: z.boolean(),
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const periodQuerySchema = z.object({ from: dayStringSchema, to: dayStringSchema });

export const myEntriesSchema = z.object({
  from: dayStringSchema,
  to: dayStringSchema,
  entries: z.array(timeEntrySchema),
  totalMs: z.number().int(),
  amount: z.number(),
  hourlyRate: z.number(),
  currency: z.string(),
});
export type MyEntries = z.infer<typeof myEntriesSchema>;

export const createEntrySchema = z
  .object({
    taskId: z.number().int().nullish(),
    note: noteSchema.default(''),
    startedAt: isoSchema,
    endedAt: isoSchema,
  })
  .refine((v) => v.taskId != null || v.note.length > 0, { message: 'укажите задачу или описание', path: ['note'] });

export const updateEntrySchema = z.object({
  taskId: z.number().int().nullable().optional(),
  note: noteSchema.optional(),
  startedAt: isoSchema.optional(),
  endedAt: isoSchema.optional(),
});

// ---- админ ----

export const reportItemSchema = z.object({
  taskId: z.number().int().nullable(),
  taskNumber: z.number().int().nullable(),
  /** название задачи или описание работы без задачи */
  label: z.string(),
  ms: z.number().int(),
});

export const reportUserSchema = z.object({
  userId: z.number().int(),
  username: z.string(),
  color: z.string(),
  totalMs: z.number().int(),
  amount: z.number(),
  /** сейчас идёт таймер */
  running: z.boolean(),
  days: z.array(z.object({ date: dayStringSchema, ms: z.number().int() })),
  items: z.array(reportItemSchema),
  /** выплата за этот период, если уже отмечена (только для половин месяца) */
  payout: z.lazy(() => payoutSchema).nullable(),
});

/** Отчёт по проектам (доскам): сколько времени ушло на доску, кем и на какие задачи. boardId=null — работа без задачи. */
export const reportProjectSchema = z.object({
  boardId: z.number().int().nullable(),
  name: z.string(),
  totalMs: z.number().int(),
  amount: z.number(),
  people: z.array(z.object({ userId: z.number().int(), username: z.string(), color: z.string(), ms: z.number().int() })),
  items: z.array(reportItemSchema),
});
export type ReportProject = z.infer<typeof reportProjectSchema>;

export const timeReportSchema = z.object({
  from: dayStringSchema,
  to: dayStringSchema,
  timeZone: z.string(),
  hourlyRate: z.number(),
  currency: z.string(),
  totalMs: z.number().int(),
  totalAmount: z.number(),
  users: z.array(reportUserSchema),
  projects: z.array(reportProjectSchema),
  /** срок выплаты периода, если это половина месяца; null — произвольный диапазон */
  payoutDue: dayStringSchema.nullable(),
  /** сегодня по поясу приложения */
  today: dayStringSchema,
});
export type TimeReport = z.infer<typeof timeReportSchema>;
export type ReportUser = z.infer<typeof reportUserSchema>;

export const reportQuerySchema = periodQuerySchema.extend({
  userId: z.coerce.number().int().optional(),
  // для csv: разбивка по людям (по умолчанию) или по проектам
  view: z.enum(['users', 'projects']).optional(),
});

export const liveTimerSchema = z.object({
  userId: z.number().int(),
  username: z.string(),
  color: z.string(),
  status: z.enum(['running', 'paused']),
  label: z.string(),
  /** отработано в текущем запуске, мс (для running клиент добавляет время с `now`) */
  closedMs: z.number().int(),
  segmentStartedAt: z.string().nullable(),
  now: z.string(),
});
export type LiveTimer = z.infer<typeof liveTimerSchema>;

// ---- периоды отчёта ----

export type PeriodKind = 'half1' | 'half2' | 'payout' | 'last7' | 'last14' | 'month';

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  half1: '1–15',
  half2: '16–конец',
  payout: 'к выплате',
  last7: '7 дней',
  last14: '14 дней',
  month: 'месяц',
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Сдвиг даты `YYYY-MM-DD` на n дней (чистая календарная арифметика, без часовых поясов) */
export function addDays(day: string, n: number): string {
  const { y, m, d } = parse(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Границы периода (включительно) по «сегодня» в часовом поясе приложения.
 * Выплаты 1-го и 15-го: `half1` = 1–15, `half2` = 16–конец месяца, `payout` = текущая половина месяца,
 * за которую сейчас копятся часы (до 15-го включительно: 1–15, дальше: 16–конец).
 */
export function resolvePeriod(kind: PeriodKind, today: string): { from: string; to: string } {
  const { y, m, d } = parse(today);
  switch (kind) {
    case 'half1':
      return { from: fmt(y, m, 1), to: fmt(y, m, 15) };
    case 'half2':
      return { from: fmt(y, m, 16), to: fmt(y, m, daysIn(y, m)) };
    case 'month':
      return { from: fmt(y, m, 1), to: fmt(y, m, daysIn(y, m)) };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last14':
      return { from: addDays(today, -13), to: today };
    case 'payout':
      return d <= 15 ? { from: fmt(y, m, 1), to: fmt(y, m, 15) } : { from: fmt(y, m, 16), to: fmt(y, m, daysIn(y, m)) };
  }
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/**
 * Человекочитаемая подпись периода: «за ноябрь 2026, 1–15», «за ноябрь 2026, 16–30», «за ноябрь 2026» (месяц целиком);
 * произвольный диапазон — «01.11.2026 – 07.11.2026».
 */
export function periodTitle(from: string, to: string): string {
  const a = parse(from);
  const b = parse(to);
  const ru = (s: string) => s.split('-').reverse().join('.');
  if (a.y === b.y && a.m === b.m) {
    const last = daysIn(a.y, a.m);
    const month = `${MONTHS[a.m - 1]} ${a.y}`;
    if (a.d === 1 && b.d === last) return `за ${month}`;
    if (a.d === 1 && b.d === 15) return `за ${month}, 1–15`;
    if (a.d === 16 && b.d === last) return `за ${month}, 16–${last}`;
  }
  return from === to ? ru(from) : `${ru(from)} – ${ru(to)}`;
}

/**
 * Срок выплаты, если период — стандартная половина месяца: 1–15 платим 15-го, 16–конец — 1-го следующего месяца.
 * Для произвольного диапазона — null (выплаты фиксируются только по половинам месяца).
 */
export function payoutDueDate(from: string, to: string): string | null {
  const a = parse(from);
  const b = parse(to);
  if (a.y !== b.y || a.m !== b.m) return null;
  if (a.d === 1 && b.d === 15) return fmt(a.y, a.m, 15);
  if (a.d === 16 && b.d === daysIn(a.y, a.m)) return a.m === 12 ? fmt(a.y + 1, 1, 1) : fmt(a.y, a.m + 1, 1);
  return null;
}

/** Последние n половин месяца, у которых срок выплаты уже наступил (от новых к старым) */
export function duePayoutPeriods(today: string, n: number): { from: string; to: string; due: string }[] {
  const out: { from: string; to: string; due: string }[] = [];
  let ref = resolvePeriod('payout', today);
  // идём назад по половинам, пока не наберём n наступивших сроков
  for (let guard = 0; guard < n + 4 && out.length < n; guard++) {
    const due = payoutDueDate(ref.from, ref.to)!;
    if (due <= today) out.push({ ...ref, due });
    ref = resolvePeriod('payout', addDays(ref.from, -1));
  }
  return out;
}

/** 3725000 → «1ч 02м»; для таймера с секундами — formatClock */
export function formatDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}ч ${pad(mins % 60)}м` : `${mins}м`;
}

/** 3725000 → «01:02:05» */
export function formatClock(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Сумма к выплате, округление до копеек */
export function amountFor(ms: number, hourlyRate: number): number {
  return Math.round((ms / 3_600_000) * hourlyRate * 100) / 100;
}

// ---- выплаты ----

/** Зафиксированная выплата: сколько часов и по какой ставке было в момент отметки «выплачено» */
export const payoutSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  username: z.string(),
  color: z.string(),
  from: dayStringSchema,
  to: dayStringSchema,
  ms: z.number().int(),
  hourlyRate: z.number(),
  currency: z.string(),
  amount: z.number(),
  paidAt: z.string(),
  paidBy: z.string().nullable(),
  note: z.string(),
});
export type Payout = z.infer<typeof payoutSchema>;

export const markPaidSchema = z.object({
  userId: z.number().int(),
  from: dayStringSchema,
  to: dayStringSchema,
  note: z.string().trim().max(500).default(''),
});
export type MarkPaidInput = z.input<typeof markPaidSchema>;

export const payoutsQuerySchema = z.object({ userId: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(500).optional() });

/** Невыплаченное при наступившем сроке */
export const duePayoutSchema = z.object({
  from: dayStringSchema,
  to: dayStringSchema,
  due: dayStringSchema,
  userId: z.number().int(),
  username: z.string(),
  color: z.string(),
  ms: z.number().int(),
  amount: z.number(),
});
export type DuePayout = z.infer<typeof duePayoutSchema>;
