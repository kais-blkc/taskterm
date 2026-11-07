/** Работа с часовыми поясами без библиотек (Intl). Нужна для границ дней/периодов отчёта в поясе приложения. */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Смещение пояса от UTC в мс в данный момент */
function offsetMs(ts: number, tz: string): number {
  const p = Object.fromEntries(parts(tz).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Момент (мс) начала суток `YYYY-MM-DD` в поясе tz */
export function startOfDay(day: string, tz: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - offsetMs(guess, tz);
  ts = guess - offsetMs(ts, tz); // уточнение на границе перехода
  return ts;
}

/** Дата `YYYY-MM-DD` момента в поясе tz */
export function dayOf(ts: number, tz: string): string {
  const p = Object.fromEntries(parts(tz).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
