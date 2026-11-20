import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, resolvePeriod, type TimeEntry } from '@taskterm/shared';
import { useEntryMutations, useMyEntries, useTimeSettings } from '../api/time';
import { PeriodPicker } from '../components/PeriodPicker';
import { ROUTES } from '../consts/routes';
import { formatDateTime } from '../lib/dates';
import { fromLocalInput, money, toLocalInput, todayIn } from '../lib/time';
import { confirmDialog } from '../stores/confirm';

const inputCls = 'border border-line bg-bg px-2 py-1 outline-none focus:border-accent';

function EntryRow({ e }: { e: TimeEntry }) {
  const m = useEntryMutations();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(e.note);
  const [start, setStart] = useState(toLocalInput(e.startedAt));
  const [end, setEnd] = useState(e.endedAt ? toLocalInput(e.endedAt) : '');
  const running = e.endedAt === null;
  const error = m.update.error ?? m.remove.error;

  const save = () =>
    m.update.mutate(
      { id: e.id, note, startedAt: fromLocalInput(start), endedAt: running ? undefined : fromLocalInput(end) },
      { onSuccess: () => setEditing(false) },
    );

  return (
    <li className="time-entry space-y-1 border border-line bg-bg px-3 py-2">
      {editing ? (
        <div className="space-y-2">
          <input value={note} maxLength={500} onChange={(ev) => setNote(ev.target.value)} placeholder="описание" className={`${inputCls} w-full`} />
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} className={inputCls} />
            {!running && (
              <>
                …
                <input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} className={inputCls} />
              </>
            )}
            <button type="button" className="btn btn-primary" disabled={m.update.isPending} onClick={save}>
              сохранить
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate">
              {e.taskId != null && e.boardId != null ? (
                <Link to={ROUTES.TASK(e.boardId, e.taskId)} className="hover:text-accent">
                  #{e.taskNumber} {e.taskTitle}
                </Link>
              ) : null}
              {e.taskId != null && e.note && <span className="text-muted"> — </span>}
              {e.note}
            </div>
            <div className="text-xs text-muted">
              {formatDateTime(e.startedAt)} → {e.endedAt ? formatDateTime(e.endedAt) : <span className="text-accent">идёт</span>}
              {e.edited && <span title="время или описание правили вручную"> · изменено вручную</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{formatDuration(e.durationMs)}</span>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              изменить
            </button>
            {!running && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Удалить запись?', message: `${formatDuration(e.durationMs)} — ${e.note || e.taskTitle || ''}`, danger: true })) m.remove.mutate(e.id);
                }}
              >
                удалить
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-[14px] text-danger">! {error.message}</p>}
    </li>
  );
}

function AddEntry({ onDone }: { onDone: () => void }) {
  const m = useEntryMutations();
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const s = fromLocalInput(start);
  const en = fromLocalInput(end);
  const valid = note.trim().length > 0 && !!s && !!en;
  return (
    <div className="time-add space-y-2 border border-line bg-elev p-4">
      <h2>## добавить время вручную</h2>
      <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="над чем работали" className={`${inputCls} w-full`} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" value={start} max={toLocalInput(Date.now())} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        …
        <input type="datetime-local" value={end} max={toLocalInput(Date.now())} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || m.create.isPending}
          onClick={() => m.create.mutate({ note: note.trim(), startedAt: s!, endedAt: en! }, { onSuccess: onDone })}
        >
          добавить
        </button>
        <button type="button" className="btn" onClick={onDone}>
          отмена
        </button>
      </div>
      {m.create.error && <p className="text-[14px] text-danger">! {m.create.error.message}</p>}
    </div>
  );
}

/** Мои часы: записи таймера за период, итог и сумма, ручное добавление и правка */
export function TimePage() {
  const settings = useTimeSettings();
  const tz = settings.data?.timeZone ?? 'Europe/Moscow';
  const today = todayIn(tz);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const { from, to } = period ?? resolvePeriod('payout', today);
  const data = useMyEntries(from, to);
  const [adding, setAdding] = useState(false);

  return (
    <div className="time-page mx-auto max-w-4xl space-y-4 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">$ время</h1>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + добавить время вручную
          </button>
        )}
      </div>
      {adding && <AddEntry onDone={() => setAdding(false)} />}
      <PeriodPicker today={today} from={from} to={to} onChange={setPeriod} />
      <p className="text-[14px] text-muted">// границы дней — по часовому поясу приложения ({tz})</p>

      {data.isLoading && <p className="text-muted">Загрузка…</p>}
      {data.error && <p className="text-danger">! {data.error.message}</p>}
      {data.data && (
        <>
          <div className="time-total flex flex-wrap items-baseline gap-x-6 border border-line bg-elev p-4">
            <span className="text-lg text-accent">{formatDuration(data.data.totalMs)}</span>
            <span>
              {money(data.data.amount, data.data.currency)} <span className="text-muted">({money(data.data.hourlyRate, data.data.currency)}/ч)</span>
            </span>
          </div>
          {data.data.entries.length === 0 && <p className="text-[14px] text-muted">// за этот период записей нет</p>}
          <ul className="time-entries space-y-1">
            {[...data.data.entries].reverse().map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
