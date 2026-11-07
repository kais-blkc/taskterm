import { PERIOD_LABELS, resolvePeriod, type PeriodKind } from '@taskterm/shared';

const KINDS: PeriodKind[] = ['lastPaid', 'half1', 'half2', 'month'];

/** Быстрый выбор периода (выплаты 1-го и 15-го, 7/14 дней, месяц) + произвольные даты */
export function PeriodPicker({
  today,
  from,
  to,
  onChange,
}: {
  today: string;
  from: string;
  to: string;
  onChange: (p: { from: string; to: string }) => void;
}) {
  return (
    <div className="period-picker space-y-2">
      <div className="flex flex-wrap gap-1">
        {KINDS.map((k) => {
          const p = resolvePeriod(k, today);
          const active = p.from === from && p.to === to;
          return (
            <button
              key={k}
              type="button"
              className={`period-chip btn ${active ? 'btn-active' : ''}`}
              title={`${p.from} … ${p.to}`}
              onClick={() => onChange(p)}
            >
              {PERIOD_LABELS[k]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted">
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} className="period-from border border-line bg-bg px-2 py-1 text-fg outline-none focus:border-accent" />
        …
        <input type="date" value={to} min={from} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} className="period-to border border-line bg-bg px-2 py-1 text-fg outline-none focus:border-accent" />
      </div>
    </div>
  );
}
