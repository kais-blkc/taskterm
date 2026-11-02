import { describe, expect, it } from 'vitest';
import { addDays, dateStr, daysUntil, dueInfo } from './dates';

describe('dates', () => {
  it('dateStr uses the local calendar day, zero-padded', () => {
    expect(dateStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dateStr(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('addDays crosses month, year and leap-day boundaries', () => {
    expect(addDays(1, new Date(2026, 11, 31))).toBe('2027-01-01');
    expect(addDays(7, new Date(2026, 0, 28))).toBe('2026-02-04');
    expect(addDays(1, new Date(2028, 1, 28))).toBe('2028-02-29');
    expect(addDays(0, new Date(2026, 5, 15))).toBe('2026-06-15');
  });

  it('daysUntil counts calendar days, negative when past', () => {
    expect(daysUntil('2026-10-31', '2026-10-31')).toBe(0);
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1);
    expect(daysUntil('2026-10-29', '2026-10-31')).toBe(-2);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('dueInfo classifies deadlines', () => {
    const today = '2026-10-31';
    expect(dueInfo('2026-10-30', false, today)).toEqual({ state: 'overdue', label: 'просрочено на 1 дн.' });
    expect(dueInfo('2026-10-31', false, today)).toEqual({ state: 'soon', label: 'сегодня' });
    expect(dueInfo('2026-11-01', false, today)).toEqual({ state: 'soon', label: 'завтра' });
    expect(dueInfo('2026-11-20', false, today).state).toBe('later');
  });

  it('a finished task is never shown as overdue', () => {
    expect(dueInfo('2020-01-01', true, '2026-10-31').state).toBe('finished');
  });
});
