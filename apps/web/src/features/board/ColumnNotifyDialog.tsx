import { useEffect, useRef, useState } from 'react';
import type { Column } from '@taskterm/shared';
import { useMembers } from '../../api/boards';
import { ColorDot } from '../../components/UserTag';

/** Настройка уведомлений колонки: слать ли при переносе задачи сюда и кому */
export function ColumnNotifyDialog({
  boardId,
  column,
  meId,
  saving,
  onSave,
  onClose,
}: {
  boardId: number;
  column: Column;
  meId: number;
  saving: boolean;
  onSave: (v: { notifyOnEnter: boolean; notifyUserIds: number[] }) => void;
  onClose: () => void;
}) {
  const members = useMembers(boardId);
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(column.notifyOnEnter);
  const [ids, setIds] = useState<Set<number>>(new Set(column.notifyUserIds));

  // закрываем по Esc и по клику вне окна
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: number) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="column-notify-overlay fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-2 pt-4 sm:p-4 sm:pt-16"
      onMouseDown={(e) => !box.current?.contains(e.target as Node) && onClose()}
    >
      <div ref={box} className="column-notify-dialog w-full max-w-md space-y-4 border border-accent bg-elev p-3 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 break-words">## уведомления: {column.name}</h2>
          <button type="button" className="btn btn-danger" onClick={onClose}>
            close <span className="text-muted">esc</span>
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="cursor-pointer" />
          уведомлять, когда задачу переносят в эту колонку
        </label>

        <div className={on ? '' : 'pointer-events-none opacity-40'}>
          <p className="mb-1 text-muted">кому отправлять:</p>
          {members.isLoading && <p className="text-muted">loading...</p>}
          <ul className="column-notify-users max-h-64 space-y-1 overflow-y-auto">
            {(members.data ?? []).map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 px-1 py-0.5 hover:bg-bg">
                  <input type="checkbox" checked={ids.has(u.id)} onChange={() => toggle(u.id)} className="cursor-pointer" />
                  <ColorDot color={u.color} />
                  <span style={{ color: u.color }}>@{u.username}</span>
                  {u.id === meId && <span className="text-muted">(я)</span>}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[14px] text-muted">// тому, кто переносит задачу, уведомление не приходит</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => {
              onSave({ notifyOnEnter: on, notifyUserIds: [...ids] });
              onClose();
            }}
          >
            save
          </button>
          <button type="button" className="btn" onClick={onClose}>
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
