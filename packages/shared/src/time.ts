import { z } from 'zod';

/** Дата без времени `YYYY-MM-DD` (в часовом поясе приложения) */
export const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается дата YYYY-MM-DD');

const isoSchema = z.string().datetime({ offset: true });
const noteSchema = z.string().trim().max(500);

/** Текущий таймер пользователя. Работа хранится отрезками (entries): пауза закрывает отрезок, продолжение открывает новый. */
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
});

export const timeReportSchema = z.object({
  from: dayStringSchema,
  to: dayStringSchema,
  timeZone: z.string(),
  hourlyRate: z.number(),
  currency: z.string(),
  totalMs: z.number().int(),
  totalAmount: z.number(),
  users: z.array(reportUserSchema),
});
export type TimeReport = z.infer<typeof timeReportSchema>;
export type ReportUser = z.infer<typeof reportUserSchema>;

export const reportQuerySchema = periodQuerySchema.extend({ userId: z.coerce.number().int().optional() });

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

export type PeriodKind = 'half1' | 'half2' | 'lastPaid' | 'last7' | 'last14' | 'month';

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  half1: '1–15',
  half2: '16–конец',
  lastPaid: 'к выплате',
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
 * Выплаты 1-го и 15-го: `half1` = 1–15, `half2` = 16–конец месяца, `lastPaid` = последний закрытый
 * период (с 15-го: 1–15 этого месяца; до 15-го: 16–конец прошлого).
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
    case 'lastPaid': {
      if (d >= 15) return { from: fmt(y, m, 1), to: fmt(y, m, 15) };
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: fmt(py, pm, 16), to: fmt(py, pm, daysIn(py, pm)) };
    }
  }
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
