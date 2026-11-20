import { useState } from 'react';
import { formatClock, formatDuration, periodTitle, resolvePeriod, type Payout, type ReportProject, type ReportUser } from '@taskterm/shared';
import { reportCsvUrl, useDuePayouts, useLiveTimers, usePayoutMutations, usePayouts, useSaveTimeSettings, useTimeReport, useTimeSettings } from '../../api/time';
import { PeriodPicker } from '../../components/PeriodPicker';
import { formatDate, formatDateTime, formatDayNumeric } from '../../lib/dates';
import { confirmDialog } from '../../stores/confirm';
import { money, todayIn, useNow } from '../../lib/time';

/** Общая настройка — только валюта; ставка у каждого сотрудника своя (админка → пользователи) */
function SettingsForm() {
  const settings = useTimeSettings();
  const save = useSaveTimeSettings();
  const [currency, setCurrency] = useState<string | null>(null);
  if (!settings.data) return null;
  const c = currency ?? settings.data.currency;
  const valid = c.trim().length > 0 && c.trim() !== settings.data.currency;
  return (
    <div className="time-settings mt-8 space-y-2 border border-line bg-elev p-4">
      <h2 className="time-settings-title">## валюта</h2>
      <div className="time-settings-row flex flex-wrap items-center gap-2">
        <input value={c} name="currency" autoComplete="off" maxLength={8} onChange={(e) => setCurrency(e.target.value)} className="time-currency-input w-20 border border-line bg-bg px-2 py-1 outline-none focus:border-accent" aria-label="валюта" />
        <button
          type="button"
          className="time-currency-save btn btn-primary"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate({ currency: c.trim() }, { onSuccess: () => setCurrency(null) })}
        >
          сохранить
        </button>
      </div>
      {save.error && <p role="alert" className="time-settings-error text-[14px] text-danger">! {save.error.message}</p>}
      <p className="time-settings-hint text-[14px] text-muted">// ставка задаётся у каждого сотрудника отдельно: админка → пользователи; отчёты считают по текущей ставке</p>
    </div>
  );
}

function Live() {
  const live = useLiveTimers();
  const now = useNow(!!live.data?.length);
  return (
    <div className="time-live space-y-1">
      <h2 className="time-live-title">## сейчас в работе {live.data && <span className="time-live-count text-muted">({live.data.length})</span>}</h2>
      {live.data?.length === 0 && <p className="time-live-empty text-[14px] text-muted">// никто не запускал таймер</p>}
      <ul className="time-live-list space-y-1">
        {live.data?.map((t) => {
          const skew = Date.parse(t.now) - (live.dataUpdatedAt || Date.now());
          const ms = t.closedMs + (t.status === 'running' && t.segmentStartedAt ? Math.max(0, now + skew - Date.parse(t.segmentStartedAt)) : 0);
          return (
            <li key={t.userId} className="time-live-item flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2">
              <span className="time-live-who">
                <span style={{ color: t.color || undefined }}>@{t.username}</span> <span className="text-muted">— {t.label}</span>
              </span>
              <span className={`time-live-clock tabular-nums ${t.status === 'running' ? 'text-accent' : 'text-muted'}`}>
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

const ru = formatDayNumeric;

/** Статус выплаты за период: выплачено / не выплачено (срок наступил) / срок ещё не наступил */
function PayoutBadge({ u, due, today }: { u: ReportUser; due: string | null; today: string }) {
  if (!due || u.totalMs <= 0) return null;
  if (u.payout) return <span className="payout-badge payout-badge-paid ml-2 text-accent">✓ выплачено {ru(u.payout.paidAt.slice(0, 10))}</span>;
  if (due <= today) return <span className="payout-badge payout-badge-unpaid ml-2 text-danger">! не выплачено · срок {ru(due)}</span>;
  return <span className="payout-badge payout-badge-pending ml-2 text-muted">срок {ru(due)}</span>;
}

function PayoutControls({ u, from, to, due, today, currency }: { u: ReportUser; from: string; to: string; due: string | null; today: string; currency: string }) {
  const { markPaid, undo } = usePayoutMutations();
  if (!due || u.totalMs <= 0) return null;
  const error = markPaid.error ?? undo.error;
  return (
    <div className="payout-controls space-y-1 border-t border-line p-3 text-[14px]">
      {u.payout ? (
        <>
          <div className="payout-paid-info">
            выплачено {formatDateTime(u.payout.paidAt)}
            {u.payout.paidBy && <> · отметил @{u.payout.paidBy}</>}: {formatDuration(u.payout.ms)} × {money(u.payout.hourlyRate, u.payout.currency)}/ч = {money(u.payout.amount, u.payout.currency)}
            {u.payout.note && <span className="payout-note text-muted"> · {u.payout.note}</span>}
          </div>
          {u.payout.ms !== u.totalMs && (
            <div className="payout-changed-warning text-danger">
              ! после выплаты часы за период изменились: сейчас {formatDuration(u.totalMs)} ({u.totalMs > u.payout.ms ? '+' : '−'}
              {formatDuration(Math.abs(u.totalMs - u.payout.ms))}, {money(u.amount, currency)} по текущей ставке)
            </div>
          )}
          <button
            type="button"
            className="payout-undo btn btn-danger"
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
        <button type="button" className="payout-mark btn btn-primary" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ userId: u.userId, from, to })}>
          ✓ отметить выплаченным · {money(u.amount, currency)}
        </button>
      ) : (
        <span className="payout-not-yet text-muted">// отметить можно с {ru(due)}</span>
      )}
      {error && <p role="alert" className="payout-error text-danger">! {error.message}</p>}
    </div>
  );
}

function UserRow({ u, currency, from, to, due, today }: { u: ReportUser; currency: string; from: string; to: string; due: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="time-user-row border border-line bg-bg">
      <button type="button" className="time-row-head flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {open ? '▾' : '▸'} <span className="time-user-name" style={{ color: u.color || undefined }}>@{u.username}</span>
          {u.running && <span className="time-running-mark ml-2 text-accent">● идёт</span>}
          <PayoutBadge u={u} due={due} today={today} />
        </span>
        <span className="time-row-total tabular-nums">
          {formatDuration(u.totalMs)} <span className="text-muted">·</span> {money(u.amount, currency)}
        </span>
      </button>
      {open && (
        <div className="time-row-details grid gap-4 border-t border-line p-3 text-[14px] sm:grid-cols-2">
          <div className="time-days space-y-1">
            <div className="time-days-title text-muted">по дням</div>
            {u.days.map((d) => (
              <div key={d.date} className="time-day flex justify-between">
                <span className="time-day-date">{formatDate(d.date)}</span>
                <span className="time-day-total tabular-nums">{formatDuration(d.ms)}</span>
              </div>
            ))}
          </div>
          <div className="time-items space-y-1">
            <div className="time-items-title text-muted">над чем</div>
            {u.items.map((it, i) => (
              <div key={i} className="time-item flex justify-between gap-3">
                <span className="time-item-label truncate">
                  {it.taskNumber != null && <span className="time-item-number text-muted">#{it.taskNumber} </span>}
                  {it.label}
                </span>
                <span className="time-item-total tabular-nums">{formatDuration(it.ms)}</span>
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
    <li className="time-project-row border border-line bg-bg">
      <button type="button" className="time-row-head flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`time-project-name ${p.boardId == null ? 'text-muted' : ''}`}>
          {open ? '▾' : '▸'} {p.name}
        </span>
        <span className="time-row-total tabular-nums">
          {formatDuration(p.totalMs)} <span className="text-muted">·</span> {money(p.amount, currency)}
        </span>
      </button>
      {open && (
        <div className="time-row-details grid gap-4 border-t border-line p-3 text-[14px] sm:grid-cols-2">
          <div className="time-people space-y-1">
            <div className="time-people-title text-muted">кто работал</div>
            {p.people.map((u) => (
              <div key={u.userId} className="time-person flex justify-between gap-3">
                <span className="time-person-name" style={{ color: u.color || undefined }}>@{u.username}</span>
                <span className="time-person-total tabular-nums">{formatDuration(u.ms)}</span>
              </div>
            ))}
          </div>
          <div className="time-items space-y-1">
            <div className="time-items-title text-muted">над чем</div>
            {p.items.map((it, i) => (
              <div key={i} className="time-item flex justify-between gap-3">
                <span className="time-item-label truncate">
                  {it.taskNumber != null && <span className="time-item-number text-muted">#{it.taskNumber} </span>}
                  {it.label}
                </span>
                <span className="time-item-total tabular-nums">{formatDuration(it.ms)}</span>
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
      <h2 className="due-payouts-title">
        ## не выплачено {due.data.length > 0 && <span className="due-payouts-count text-danger">({due.data.length})</span>}
      </h2>
      {due.data.length === 0 && <p className="due-payouts-empty text-[14px] text-muted">// всё, у чего наступил срок, выплачено</p>}
      <ul className="due-payouts-list space-y-1">
        {due.data.map((d) => (
          <li key={`${d.userId}-${d.from}`} className="due-payout flex flex-wrap items-center justify-between gap-2 border border-danger bg-bg px-3 py-2">
            <span className="due-payout-who">
              <span style={{ color: d.color || undefined }}>@{d.username}</span> <span className="text-muted">— {periodTitle(d.from, d.to)}, срок {ru(d.due)}</span>
            </span>
            <span className="due-payout-actions flex items-center gap-3">
              <span className="due-payout-total tabular-nums">
                {formatDuration(d.ms)} <span className="text-muted">·</span> {money(d.amount, currency)}
              </span>
              <button type="button" className="due-payout-mark btn btn-primary" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ userId: d.userId, from: d.from, to: d.to })}>
                ✓ выплачено
              </button>
            </span>
          </li>
        ))}
      </ul>
      {markPaid.error && <p role="alert" className="due-payouts-error text-[14px] text-danger">! {markPaid.error.message}</p>}
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
      <h2 className="payout-history-title">
        <button type="button" className="payout-history-toggle text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} история выплат <span className="payout-history-count text-muted">({list.length})</span>
        </button>
      </h2>
      {open && list.length === 0 && <p className="payout-history-empty text-[14px] text-muted">// выплат ещё не отмечали</p>}
      {open && (
        <ul className="payout-history-list space-y-1">
          {list.map((p) => (
            <li key={p.id} className="payout-history-item flex flex-wrap items-center justify-between gap-2 border border-line bg-bg px-3 py-2 text-[14px]">
              <span className="payout-history-who">
                <span style={{ color: p.color || undefined }}>@{p.username}</span> <span className="text-muted">— {periodTitle(p.from, p.to)}</span>
                <span className="payout-history-meta block text-muted sm:inline sm:before:content-['_·_']">
                  выплачено {formatDateTime(p.paidAt)}
                  {p.paidBy && ` · @${p.paidBy}`}
                  {p.note && ` · ${p.note}`}
                </span>
              </span>
              <span className="payout-history-actions flex items-center gap-3">
                <span className="payout-history-total tabular-nums">
                  {formatDuration(p.ms)} <span className="text-muted">·</span> {money(p.amount, p.currency)}
                </span>
                <button
                  type="button"
                  className="payout-history-undo btn btn-danger btn-icon"
                  title="снять отметку"
                  aria-label={`снять отметку выплаты @${p.username}`}
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
      {undo.error && <p role="alert" className="payout-history-error text-[14px] text-danger">! {undo.error.message}</p>}
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
      <section className="time-report mt-8 space-y-3">
        <header className="time-report-header space-y-4 border border-line bg-elev p-4">
          <div className="time-report-views flex flex-wrap items-center justify-between gap-3">
            <h2 className="time-report-title">## отчёт</h2>
            <div className="time-report-view-switch flex gap-2">
              <button type="button" aria-pressed={view === 'users'} className={`time-report-view-users btn ${view === 'users' ? 'btn-active' : ''}`} onClick={() => setView('users')}>
                люди
              </button>
              <button type="button" aria-pressed={view === 'projects'} className={`time-report-view-projects btn ${view === 'projects' ? 'btn-active' : ''}`} onClick={() => setView('projects')}>
                проекты
              </button>
            </div>
          </div>
          <PeriodPicker today={today} from={from} to={to} onChange={setPeriod} />
          <p className="time-report-hint text-[14px] text-muted">// «к выплате» — текущая половина месяца (до 15-го: 1–15, потом 16–конец), за которую сейчас копятся часы; дни — по поясу {tz}</p>
        </header>

        {report.isLoading && <p className="time-report-loading text-muted">Загрузка…</p>}
        {report.error && <p role="alert" className="time-report-error text-danger">! {report.error.message}</p>}
        {report.data && (
          <div className="time-report-body space-y-3">
            <div className="time-report-summary flex flex-wrap items-center justify-between gap-2 border border-line bg-elev p-4">
              <div className="time-report-totals">
                <span className="time-report-hours text-lg text-accent">{formatDuration(report.data.totalMs)}</span>
                <span className="time-report-amount ml-4">{money(report.data.totalAmount, report.data.currency)}</span>
              </div>
              <a className="time-report-csv btn" href={reportCsvUrl(from, to, view)} download>
                csv
              </a>
            </div>
            {report.data.users.length === 0 && <p className="time-report-empty text-[14px] text-muted">// за период никто не работал</p>}
            <ul className="time-report-list space-y-1">
              {view === 'users'
                ? report.data.users.map((u) => (
                    <UserRow key={u.userId} u={u} currency={report.data.currency} from={from} to={to} due={report.data.payoutDue} today={report.data.today} />
                  ))
                : report.data.projects.map((p) => <ProjectRow key={p.boardId ?? 'none'} p={p} currency={report.data.currency} />)}
            </ul>
          </div>
        )}
      </section>
      <PayoutHistory />
    </section>
  );
}
