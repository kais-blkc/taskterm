import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '../lib/time';

type Mode = 'now' | 15 | 30 | 60 | 'manual';
const CHIPS: { id: Mode; label: string }[] = [
  { id: 'now', label: 'сейчас' },
  { id: 15, label: '15 мин назад' },
  { id: 30, label: '30 мин назад' },
  { id: 60, label: '1 ч назад' },
  { id: 'manual', label: 'вручную' },
];

/**
 * Выбор момента «сейчас / N минут назад / вручную» для старта и остановки таймера.
 * Возвращает ISO через onChange; undefined — «сейчас» (сервер возьмёт своё время).
 */
export function WhenPicker({ label, onChange, notBefore }: { label: string; onChange: (iso: string | undefined, valid: boolean) => void; notBefore?: string }) {
  const [mode, setMode] = useState<Mode>('now');
  const [manual, setManual] = useState(() => toLocalInput(Date.now()));

  const emit = (m: Mode, manualValue: string) => {
    if (m === 'now') return onChange(undefined, true);
    if (m === 'manual') {
      const iso = fromLocalInput(manualValue);
      const ok = !!iso && new Date(iso).getTime() <= Date.now() + 60_000 && (!notBefore || new Date(iso) > new Date(notBefore));
      return onChange(iso, ok);
    }
    const iso = new Date(Date.now() - m * 60_000).toISOString();
    onChange(iso, !notBefore || new Date(iso) > new Date(notBefore));
  };

  return (
    <div className="when-picker space-y-1">
      <div className="text-muted text-[14px]">{label}</div>
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c) => (
          <button
            key={String(c.id)}
            type="button"
            className={`when-chip btn ${mode === c.id ? 'btn-active' : ''}`}
            onClick={() => {
              setMode(c.id);
              emit(c.id, manual);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {mode === 'manual' && (
        <input
          type="datetime-local"
          value={manual}
          max={toLocalInput(Date.now())}
          onChange={(e) => {
            setManual(e.target.value);
            emit('manual', e.target.value);
          }}
          className="when-manual border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
