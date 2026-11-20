import { formatDayNumeric } from '../lib/dates';
import { PERIOD_LABELS, periodTitle, resolvePeriod, type PeriodKind } from '@taskterm/shared';

const KINDS: PeriodKind[] = ['payout', 'half1', 'half2', 'month'];

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
    <div className="period-picker space-y-3">
      <div className="period-chips flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const p = resolvePeriod(k, today);
          const active = p.from === from && p.to === to;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              className={`period-chip btn ${active ? 'btn-active' : ''}`}
              title={`${p.from} … ${p.to}`}
              onClick={() => onChange(p)}
            >
              {PERIOD_LABELS[k]}
            </button>
          );
        })}
      </div>
      <div className="period-custom flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <p className="period-title">
          <span className="text-muted">период: </span>
          <span className="text-accent">{periodTitle(from, to)}</span>
          <span className="text-muted"> ({formatDayNumeric(from)} – {formatDayNumeric(to)})</span>
        </p>
        <div className="period-dates flex items-center gap-2 text-[14px] text-muted">
          <input type="date" aria-label="период с" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} className="period-from border border-line bg-bg px-2 py-1 text-fg outline-none focus:border-accent" />
          …
          <input type="date" aria-label="период по" value={to} min={from} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} className="period-to border border-line bg-bg px-2 py-1 text-fg outline-none focus:border-accent" />
        </div>
      </div>
    </div>
  );
}
