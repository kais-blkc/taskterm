import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatClock, formatDuration, type TimerState } from '@taskterm/shared';
import { useTimerActions, useTimerState } from '../api/time';
import { ROUTES } from '../consts/routes';
import { useNow } from '../lib/time';
import { notificationsSupported, useNotifyStore } from '../stores/notifications';
import { useTimerUi, type StartPreset } from '../stores/timer';
import { WhenPicker } from './WhenPicker';

/** Напоминание «вы всё ещё работаете?» каждые 30 минут идущего таймера */
const REMIND_EVERY_MS = 30 * 60_000;

/** Сколько отработано в текущем запуске, мс (с поправкой на расхождение часов клиента и сервера) */
function useElapsed(state: TimerState | undefined, dataUpdatedAt: number): number {
  const running = state?.status === 'running';
  const now = useNow(running);
  if (!state || state.status === 'idle') return 0;
  if (!running || !state.segmentStartedAt) return state.closedMs;
  const skew = Date.parse(state.now) - dataUpdatedAt;
  return state.closedMs + Math.max(0, now + skew - Date.parse(state.segmentStartedAt));
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    // capture: пока окно открыто, хоткеи доски клавиш не получают
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className="modal-overlay timer-dialog-overlay fixed inset-0 z-[55] flex items-start justify-center bg-black/70 p-2 pt-16 sm:p-4 sm:pt-28"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="modal-dialog timer-dialog w-full max-w-md space-y-4 border border-accent bg-elev p-3 shadow-2xl sm:p-5">
        <h2>
          <span className="text-muted">$ </span>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function StartDialog() {
  const preset = useTimerUi((s) => s.startOpen);
  // тело монтируется заново при каждом открытии — поля чистые
  return preset ? <StartDialogBody preset={preset} /> : null;
}

function StartDialogBody({ preset }: { preset: StartPreset }) {
  const close = useTimerUi((s) => s.close);
  const { start } = useTimerActions();
  const [note, setNote] = useState(preset.note ?? '');
  const [startedAt, setStartedAt] = useState<string | undefined>();
  const [whenOk, setWhenOk] = useState(true);
  const needNote = preset.taskId == null;
  const valid = whenOk && (!needNote || note.trim().length > 0);
  const submit = () =>
    valid &&
    start.mutate(
      { taskId: preset.taskId ?? null, note: note.trim(), startedAt },
      {
        onSuccess: () => {
          useTimerUi.getState().setHidden(false); // запущенный таймер всегда на виду
          close();
        },
      },
    );

  return (
    <Modal title="start timer" onClose={close}>
      {preset.taskLabel && (
        <p>
          задача: <span className="text-accent">{preset.taskLabel}</span>
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-muted text-[14px]">{needNote ? 'над чем работаете? (обязательно)' : 'уточнение (необязательно)'}</span>
        <input
          autoFocus
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={needNote ? 'например: вёрстка страницы профиля' : ''}
          className="timer-note-input w-full border border-line bg-bg px-2 py-1 outline-none focus:border-accent"
        />
      </label>
      <WhenPicker
        label="когда начали"
        onChange={(iso, ok) => {
          setStartedAt(iso);
          setWhenOk(ok);
        }}
      />
      {start.error && <p className="text-danger">! {start.error.message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={close}>
          cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!valid || start.isPending} onClick={submit}>
          ▶ start
        </button>
      </div>
    </Modal>
  );
}

function StopDialog({ state }: { state: TimerState }) {
  const open = useTimerUi((s) => s.stopOpen);
  return open ? <StopDialogBody state={state} /> : null;
}

function StopDialogBody({ state }: { state: TimerState }) {
  const close = useTimerUi((s) => s.close);
  const { stop } = useTimerActions();
  const [endedAt, setEndedAt] = useState<string | undefined>();
  const [whenOk, setWhenOk] = useState(true);
  return (
    <Modal title="stop timer" onClose={close}>
      <WhenPicker
        label="когда закончили"
        notBefore={state.status === 'running' ? (state.segmentStartedAt ?? undefined) : undefined}
        onChange={(iso, ok) => {
          setEndedAt(iso);
          setWhenOk(ok);
        }}
      />
      {stop.error && <p className="text-danger">! {stop.error.message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={close}>
          cancel
        </button>
        <button type="button" className="btn btn-danger-solid" disabled={!whenOk || stop.isPending} onClick={() => stop.mutate(endedAt, { onSuccess: close })}>
          ■ stop
        </button>
      </div>
    </Modal>
  );
}

function remind(elapsed: number, label: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !useNotifyStore.getState().enabled) return;
  const n = new Notification(`Таймер идёт ${formatDuration(elapsed)}`, { body: `${label}\nВсё ещё работаете? Не забудьте поставить паузу или остановить.`, tag: 'work-timer', requireInteraction: false });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/**
 * Таймер работы. Остановлен — маленькая кнопка в шапке. Запущен или на паузе — панель поверх всего (fixed),
 * чтобы было всегда видно, что время идёт (или стоит). Каждые 30 минут работы — напоминание.
 */
export function WorkTimer() {
  const { data: state, dataUpdatedAt } = useTimerState();
  const { pause, resume } = useTimerActions();
  const openStop = useTimerUi((s) => s.openStop);
  const elapsed = useElapsed(state, dataUpdatedAt);
  const running = state?.status === 'running';

  // напоминания: номер «получаса» растёт → дёргаем уведомление и подсвечиваем панель до любого действия
  const [alertText, setAlertText] = useState<string | null>(null);
  const lastBucket = useRef<number | null>(null);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const bucket = Math.floor(elapsed / REMIND_EVERY_MS);
  const label = state ? [state.taskNumber != null ? `#${state.taskNumber} ${state.taskTitle ?? ''}` : '', state.note].filter(Boolean).join(' — ') : '';
  useEffect(() => {
    if (!running) {
      lastBucket.current = null;
      setAlertText(null);
      return;
    }
    // при первом показе (в т.ч. после перезагрузки страницы) не напоминаем о прошлых получасах
    if (lastBucket.current === null) lastBucket.current = bucket;
    else if (bucket > lastBucket.current) {
      lastBucket.current = bucket;
      setAlertText(`идёт уже ${formatDuration(elapsedRef.current)} — всё ещё работаете?`);
      remind(elapsedRef.current, label);
    }
  }, [running, bucket, label]);

  const clock = formatClock(elapsed);
  // время в заголовке вкладки: видно, даже когда вкладка не открыта
  useEffect(() => {
    if (!state || state.status === 'idle') return;
    const prev = document.title;
    document.title = `${running ? '▶' : '⏸'} ${clock} · ${prev.replace(/^[▶⏸] [\d:]+ · /, '')}`;
    return () => {
      document.title = prev;
    };
  }, [state, running, clock]);

  const openStart = useTimerUi((s) => s.openStart);
  const hidden = useTimerUi((s) => s.hidden);
  const setHidden = useTimerUi((s) => s.setHidden);
  const idle = !state || state.status === 'idle';
  const last = state?.last ?? null;
  const lastLabel = last ? [last.taskNumber != null ? `#${last.taskNumber} ${last.taskTitle ?? ''}` : '', last.note].filter(Boolean).join(' — ') : '';
  const continueLast = () =>
    last &&
    openStart({
      taskId: last.taskId ?? undefined,
      taskLabel: last.taskNumber != null ? `#${last.taskNumber} ${last.taskTitle ?? ''}` : undefined,
      note: last.note,
    });
  return (
    <>
      {hidden ? (
        // панель скрыта крестиком — в шапке остаётся кнопка, чтобы вернуть её
        <button
          type="button"
          className="timer-show-button btn"
          onClick={() => setHidden(false)}
          title="показать панель таймера"
        >
          {idle ? '▶ timer' : `${running ? '●' : '⏸'} ${clock}`}
        </button>
      ) : (
        <div
          className={`work-timer fixed bottom-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col gap-1 border bg-elev p-2 shadow-2xl sm:p-3 ${
            alertText ? 'border-danger' : running ? 'border-accent' : 'border-line'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <span className={`work-timer-dot ${running ? 'animate-pulse text-accent' : 'text-muted'}`}>{running ? '●' : idle ? '○' : '⏸'}</span>
            <span className={`work-timer-clock text-lg tabular-nums ${running ? 'text-accent' : 'text-muted'}`}>{clock}</span>
            {state?.status === 'paused' && <span className="text-muted text-[14px]">пауза</span>}
            {idle && <span className="text-muted text-[14px]">остановлен</span>}
            <div className="ml-auto flex gap-1">
              {idle ? (
                <>
                  {last && (
                    <button type="button" className="timer-continue btn btn-primary" onClick={continueLast} title={`продолжить: ${lastLabel}`}>
                      ▶ continue
                    </button>
                  )}
                  <button type="button" className={`timer-start-button btn ${last ? '' : 'btn-primary'}`} onClick={() => openStart()} title="запустить таймер на новом деле">
                    ▶ {last ? 'new' : 'start'}
                  </button>
                </>
              ) : running ? (
                <button type="button" className="timer-pause btn" disabled={pause.isPending} onClick={() => { setAlertText(null); pause.mutate(); }}>
                  ⏸ pause
                </button>
              ) : (
                <button type="button" className="timer-resume btn btn-primary" disabled={resume.isPending} onClick={() => { setAlertText(null); resume.mutate(); }}>
                  ▶ resume
                </button>
              )}
              {!idle && (
                <button type="button" className="timer-stop btn btn-danger" onClick={() => { setAlertText(null); openStop(); }}>
                  ■ stop
                </button>
              )}
              <button type="button" className="timer-hide btn btn-danger btn-icon" title="скрыть панель таймера" onClick={() => setHidden(true)}>
                ×
              </button>
            </div>
          </div>
          {idle ? (
            lastLabel && (
              <div className="work-timer-label max-w-xs truncate text-[14px] text-muted" title={lastLabel}>
                последнее: {lastLabel}
              </div>
            )
          ) : (
            <div className="work-timer-label max-w-xs truncate text-[14px] text-muted" title={label}>
              {state!.taskId != null && state!.boardId != null ? (
                <Link to={ROUTES.TASK(state!.boardId, state!.taskId)} className="hover:text-accent">
                  {label}
                </Link>
              ) : (
                label
              )}
            </div>
          )}
          {alertText && <div className="work-timer-alert text-[14px] text-danger">! {alertText}</div>}
          {(pause.error ?? resume.error) && <div className="text-[14px] text-danger">! {(pause.error ?? resume.error)!.message}</div>}
        </div>
      )}
      <StartDialog />
      {state && <StopDialog state={state} />}
    </>
  );
}
