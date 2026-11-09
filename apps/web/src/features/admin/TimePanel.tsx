import { useState } from 'react';
import { formatClock, formatDuration, periodTitle, resolvePeriod, type Payout, type ReportProject, type ReportUser } from '@taskterm/shared';
import { reportCsvUrl, useDuePayouts, useLiveTimers, usePayoutMutations, usePayouts, useSaveTimeSettings, useTimeReport, useTimeSettings } from '../../api/time';
import { PeriodPicker } from '../../components/PeriodPicker';
import { formatDate, formatDateTime } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';
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
    <div className="time-settings mt-8 space-y-2 border border-line bg-elev p-4">
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

const ru = (d: string) => d.split('-').reverse().join('.');

/** Статус выплаты за период: выплачено / не выплачено (срок наступил) / срок ещё не наступил */
function PayoutBadge({ u, due, today }: { u: ReportUser; due: string | null; today: string }) {
  if (!due || u.totalMs <= 0) return null;
  if (u.payout) return <span className="ml-2 text-accent">✓ выплачено {ru(u.payout.paidAt.slice(0, 10))}</span>;
  if (due <= today) return <span className="ml-2 text-danger">! не выплачено · срок {ru(due)}</span>;
  return <span className="ml-2 text-muted">срок {ru(due)}</span>;
}

function PayoutControls({ u, from, to, due, today, currency }: { u: ReportUser; from: string; to: string; due: string | null; today: string; currency: string }) {
  const { markPaid, undo } = usePayoutMutations();
  if (!due || u.totalMs <= 0) return null;
  const error = markPaid.error ?? undo.error;
  return (
    <div className="payout-controls space-y-1 border-t border-line p-3 text-[14px]">
      {u.payout ? (
        <>
          <div>
            выплачено {formatDateTime(u.payout.paidAt)}
            {u.payout.paidBy && <> · отметил @{u.payout.paidBy}</>}: {formatDuration(u.payout.ms)} × {money(u.payout.hourlyRate, u.payout.currency)}/ч = {money(u.payout.amount, u.payout.currency)}
            {u.payout.note && <span className="text-muted"> · {u.payout.note}</span>}
          </div>
          {u.payout.ms !== u.totalMs && (
            <div className="text-danger">
              ! после выплаты часы за период изменились: сейчас {formatDuration(u.totalMs)} ({u.totalMs > u.payout.ms ? '+' : '−'}
              {formatDuration(Math.abs(u.totalMs - u.payout.ms))}, {money(u.amount, currency)} по текущей ставке)
            </div>
          )}
          <button
            type="button"
            className="btn btn-danger"
            disabled={undo.isPending}
            onClick={async () => {
              const ok = await confirmDialog({ title: 'Снять отметку «выплачено»?', message: `@${u.username}, ${periodTitle(from, to)}. Запись о выплате будет удалена из истории.`, danger: true });
              if (ok) undo.mutate(u.payout!.id);
            }}
          >
            снять отметку
          </button>
        </>
      ) : due <= today ? (
        <button type="button" className="btn btn-primary" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ userId: u.userId, from, to })}>
          ✓ отметить выплаченным · {money(u.amount, currency)}
        </button>
      ) : (
        <span className="text-muted">// отметить можно с {ru(due)}</span>
      )}
      {error && <p className="text-danger">! {error.message}</p>}
    </div>
  );
}

function UserRow({ u, currency, from, to, due, today }: { u: ReportUser; currency: string; from: string; to: string; due: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-line bg-bg">
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span>
          {open ? '▾' : '▸'} <span style={{ color: u.color || undefined }}>@{u.username}</span>
          {u.running && <span className="ml-2 text-accent">● идёт</span>}
          <PayoutBadge u={u} due={due} today={today} />
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
      {open && <PayoutControls u={u} from={from} to={to} due={due} today={today} currency={currency} />}
    </li>
  );
}

function ProjectRow({ p, currency }: { p: ReportProject; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-line bg-bg">
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span className={p.boardId == null ? 'text-muted' : ''}>
          {open ? '▾' : '▸'} {p.name}
        </span>
        <span className="tabular-nums">
          {formatDuration(p.totalMs)} <span className="text-muted">·</span> {money(p.amount, currency)}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-3 text-[14px] sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-muted">кто работал</div>
            {p.people.map((u) => (
              <div key={u.userId} className="flex justify-between gap-3">
                <span style={{ color: u.color || undefined }}>@{u.username}</span>
                <span className="tabular-nums">{formatDuration(u.ms)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-muted">над чем</div>
            {p.items.map((it, i) => (
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

/** Кому пора заплатить: период, срок которого наступил, а выплата не отмечена */
function DuePayouts({ currency }: { currency: string }) {
  const due = useDuePayouts();
  const { markPaid } = usePayoutMutations();
  if (!due.data) return null;
  return (
    <div className="due-payouts mt-8 space-y-1">
      <h2>
        ## не выплачено {due.data.length > 0 && <span className="text-danger">({due.data.length})</span>}
      </h2>
      {due.data.length === 0 && <p className="text-[14px] text-muted">// всё, у чего наступил срок, выплачено</p>}
      <ul className="space-y-1">
        {due.data.map((d) => (
          <li key={`${d.userId}-${d.from}`} className="flex flex-wrap items-center justify-between gap-2 border border-danger bg-bg px-3 py-2">
            <span>
              <span style={{ color: d.color || undefined }}>@{d.username}</span> <span className="text-muted">— {periodTitle(d.from, d.to)}, срок {ru(d.due)}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">
                {formatDuration(d.ms)} <span className="text-muted">·</span> {money(d.amount, currency)}
              </span>
              <button type="button" className="btn btn-primary" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ userId: d.userId, from: d.from, to: d.to })}>
                ✓ выплачено
              </button>
            </span>
          </li>
        ))}
      </ul>
      {markPaid.error && <p className="text-[14px] text-danger">! {markPaid.error.message}</p>}
    </div>
  );
}

function PayoutHistory() {
  const history = usePayouts();
  const { undo } = usePayoutMutations();
  const [open, setOpen] = useState(false);
  const list: Payout[] = history.data ?? [];
  return (
    <div className="payout-history mt-8 space-y-1">
      <button type="button" className="text-left" onClick={() => setOpen(!open)}>
        <h2>
          {open ? '▾' : '▸'} история выплат <span className="text-muted">({list.length})</span>
        </h2>
      </button>
      {open && list.length === 0 && <p className="text-[14px] text-muted">// выплат ещё не отмечали</p>}
      {open && (
        <ul className="space-y-1">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2 text-[14px]">
              <span>
                <span style={{ color: p.color || undefined }}>@{p.username}</span> <span className="text-muted">— {periodTitle(p.from, p.to)}</span>
                <span className="block text-muted sm:inline sm:before:content-['_·_']">
                  выплачено {formatDateTime(p.paidAt)}
                  {p.paidBy && ` · @${p.paidBy}`}
                  {p.note && ` · ${p.note}`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {formatDuration(p.ms)} <span className="text-muted">·</span> {money(p.amount, p.currency)}
                </span>
                <button
                  type="button"
                  className="btn btn-danger btn-icon"
                  title="снять отметку"
                  onClick={async () => {
                    const ok = await confirmDialog({ title: 'Снять отметку «выплачено»?', message: `@${p.username}, ${periodTitle(p.from, p.to)}. Запись будет удалена из истории.`, danger: true });
                    if (ok) undo.mutate(p.id);
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {undo.error && <p className="text-[14px] text-danger">! {undo.error.message}</p>}
    </div>
  );
}

/** Вкладка админки «время»: кто сейчас работает, ставка, отчёт за период (в т. ч. под выплаты 1-го и 15-го) */
export function TimePanel() {
  const settings = useTimeSettings();
  const tz = settings.data?.timeZone ?? 'Europe/Moscow';
  const today = todayIn(tz);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const { from, to } = period ?? resolvePeriod('payout', today);
  const report = useTimeReport(from, to);
  const [view, setView] = useState<'users' | 'projects'>('users');

  return (
    <section className="admin-time-panel space-y-4">
      <Live />
      <SettingsForm />
      <DuePayouts currency={settings.data?.currency ?? ''} />
      <div className="mt-8 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2">## отчёт</h2>
          <button type="button" className={`btn ${view === 'users' ? 'btn-active' : ''}`} onClick={() => setView('users')}>
            люди
          </button>
          <button type="button" className={`time-projects-button btn ${view === 'projects' ? 'btn-active' : ''}`} onClick={() => setView('projects')}>
            Проекты
          </button>
        </div>
        <PeriodPicker today={today} from={from} to={to} onChange={setPeriod} />
        <p className="text-[14px] text-muted">// «к выплате» — текущая половина месяца (до 15-го: 1–15, потом 16–конец), за которую сейчас копятся часы; дни — по поясу {tz}</p>
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
            <a className="btn" href={reportCsvUrl(from, to, view)} download>
              csv
            </a>
          </div>
          {report.data.users.length === 0 && <p className="text-[14px] text-muted">// за период никто не работал</p>}
          <ul className="space-y-1">
            {view === 'users'
              ? report.data.users.map((u) => (
                  <UserRow key={u.userId} u={u} currency={report.data.currency} from={from} to={to} due={report.data.payoutDue} today={report.data.today} />
                ))
              : report.data.projects.map((p) => <ProjectRow key={p.boardId ?? 'none'} p={p} currency={report.data.currency} />)}
          </ul>
        </>
      )}
      <PayoutHistory />
    </section>
  );
}
