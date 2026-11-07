import { useState } from 'react';
import { formatClock, formatDuration, resolvePeriod, type ReportUser } from '@taskterm/shared';
import { reportCsvUrl, useLiveTimers, useSaveTimeSettings, useTimeReport, useTimeSettings } from '../../api/time';
import { PeriodPicker } from '../../components/PeriodPicker';
import { formatDate } from '../../lib/dates';
import { money, todayIn, useNow } from '../../lib/time';

function SettingsForm() {
  const settings = useTimeSettings();
  const save = useSaveTimeSettings();
  const [rate, setRate] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  if (!settings.data) return null;
  const r = rate ?? String(settings.data.hourlyRate);
  const c = currency ?? settings.data.currency;
  const num = Number(r.replace(',', '.'));
  const valid = r.trim() !== '' && Number.isFinite(num) && num >= 0 && c.trim().length > 0;
  return (
    <div className="time-settings space-y-2 border border-line bg-elev p-4">
      <h2>## ставка</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input value={r} inputMode="decimal" onChange={(e) => setRate(e.target.value)} className="w-24 border border-line bg-bg px-2 py-1 outline-none focus:border-accent" aria-label="ставка за час" />
        <input value={c} maxLength={8} onChange={(e) => setCurrency(e.target.value)} className="w-20 border border-line bg-bg px-2 py-1 outline-none focus:border-accent" aria-label="валюта" />
        <span className="text-muted">за час</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate({ hourlyRate: num, currency: c.trim() }, { onSuccess: () => { setRate(null); setCurrency(null); } })}
        >
          save
        </button>
      </div>
      {save.error && <p className="text-[14px] text-danger">! {save.error.message}</p>}
      <p className="text-[14px] text-muted">// ставка одна для всех; отчёты считают сумму по текущей ставке</p>
    </div>
  );
}

function Live() {
  const live = useLiveTimers();
  const now = useNow(!!live.data?.length);
  return (
    <div className="time-live space-y-1">
      <h2>## сейчас в работе {live.data && <span className="text-muted">({live.data.length})</span>}</h2>
      {live.data?.length === 0 && <p className="text-[14px] text-muted">// никто не запускал таймер</p>}
      <ul className="space-y-1">
        {live.data?.map((t) => {
          const skew = Date.parse(t.now) - (live.dataUpdatedAt || Date.now());
          const ms = t.closedMs + (t.status === 'running' && t.segmentStartedAt ? Math.max(0, now + skew - Date.parse(t.segmentStartedAt)) : 0);
          return (
            <li key={t.userId} className="flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
              <span>
                <span style={{ color: t.color || undefined }}>@{t.username}</span> <span className="text-muted">— {t.label}</span>
              </span>
              <span className={`tabular-nums ${t.status === 'running' ? 'text-accent' : 'text-muted'}`}>
                {t.status === 'running' ? '● ' : '⏸ '}
                {formatClock(ms)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UserRow({ u, currency }: { u: ReportUser; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-line bg-bg">
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span>
          {open ? '▾' : '▸'} <span style={{ color: u.color || undefined }}>@{u.username}</span>
          {u.running && <span className="ml-2 text-accent">● идёт</span>}
        </span>
        <span className="tabular-nums">
          {formatDuration(u.totalMs)} <span className="text-muted">·</span> {money(u.amount, currency)}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-3 text-[14px] sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-muted">по дням</div>
            {u.days.map((d) => (
              <div key={d.date} className="flex justify-between">
                <span>{formatDate(d.date)}</span>
                <span className="tabular-nums">{formatDuration(d.ms)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-muted">над чем</div>
            {u.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="truncate">
                  {it.taskNumber != null && <span className="text-muted">#{it.taskNumber} </span>}
                  {it.label}
                </span>
                <span className="tabular-nums">{formatDuration(it.ms)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

/** Вкладка админки «время»: кто сейчас работает, ставка, отчёт за период (в т. ч. под выплаты 1-го и 15-го) */
export function TimePanel() {
  const settings = useTimeSettings();
  const tz = settings.data?.timeZone ?? 'Europe/Moscow';
  const today = todayIn(tz);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const { from, to } = period ?? resolvePeriod('lastPaid', today);
  const report = useTimeReport(from, to);

  return (
    <section className="admin-time-panel space-y-4">
      <Live />
      <SettingsForm />
      <div className="space-y-2">
        <h2>## отчёт</h2>
        <PeriodPicker today={today} from={from} to={to} onChange={setPeriod} />
        <p className="text-[14px] text-muted">// «к выплате» — последний закрытый период (1–15 или 16–конец месяца); дни — по поясу {tz}</p>
      </div>
      {report.isLoading && <p className="text-muted">loading...</p>}
      {report.error && <p className="text-danger">! {report.error.message}</p>}
      {report.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border border-line bg-elev p-4">
            <div>
              <span className="text-lg text-accent">{formatDuration(report.data.totalMs)}</span>
              <span className="ml-4">{money(report.data.totalAmount, report.data.currency)}</span>
              <span className="ml-2 text-muted">({money(report.data.hourlyRate, report.data.currency)}/ч)</span>
            </div>
            <a className="btn" href={reportCsvUrl(from, to)} download>
              csv
            </a>
          </div>
          {report.data.users.length === 0 && <p className="text-[14px] text-muted">// за период никто не работал</p>}
          <ul className="space-y-1">
            {report.data.users.map((u) => (
              <UserRow key={u.userId} u={u} currency={report.data.currency} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
