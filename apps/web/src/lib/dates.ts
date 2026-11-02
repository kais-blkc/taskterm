/** Сегодняшняя дата в ЛОКАЛЬНОМ часовом поясе, YYYY-MM-DD (toISOString дал бы UTC и сбивал день ночью) */
export function dateStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return dateStr(d);
}

const utc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

/** Дней от today до due: <0 — просрочено, 0 — сегодня */
export function daysUntil(due: string, today: string = dateStr()): number {
  return Math.round((utc(due) - utc(today)) / 86_400_000);
}

export function formatDate(due: string): string {
  const [y, m, d] = due.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export type DueState = 'overdue' | 'soon' | 'later' | 'finished';

export interface DueInfo {
  state: DueState;
  label: string;
}

/** finished — задача в последней колонке («Сделано»): просрочка не подсвечивается */
export function dueInfo(due: string, finished: boolean, today: string = dateStr()): DueInfo {
  const days = daysUntil(due, today);
  if (finished) return { state: 'finished', label: formatDate(due) };
  if (days < 0) return { state: 'overdue', label: `просрочено на ${-days} дн.` };
  if (days === 0) return { state: 'soon', label: 'сегодня' };
  if (days === 1) return { state: 'soon', label: 'завтра' };
  return { state: 'later', label: formatDate(due) };
}

export const DUE_CLASS: Record<DueState, string> = {
  overdue: 'text-danger',
  soon: 'text-accent',
  later: 'text-muted',
  finished: 'text-muted line-through',
};

/** ISO-момент времени с сервера → «2 нояб., 15:20» в локальном поясе (для createdAt/updatedAt) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}
