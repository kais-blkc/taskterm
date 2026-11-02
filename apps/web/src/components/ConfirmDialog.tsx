import { useEffect, useRef } from 'react';
import { useConfirmStore } from '../stores/confirm';

export function ConfirmDialog() {
  const opts = useConfirmStore((s) => s.opts);
  const answer = useConfirmStore((s) => s.answer);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!opts) return;
    const previous = document.activeElement as HTMLElement | null;
    // у опасного действия фокус на «отмене», чтобы случайный Enter ничего не удалил
    (opts.danger ? cancelRef : okRef).current?.focus();

    // capture: пока диалог открыт, остальные окна и хоткеи клавиш не получают
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        answer(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const next = document.activeElement === okRef.current ? cancelRef.current : okRef.current;
        next?.focus();
      } else if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!opts.danger) answer(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [opts, answer]);

  if (!opts) return null;
  const accent = opts.danger ? 'border-danger' : 'border-accent';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-32"
      onMouseDown={(e) => e.target === e.currentTarget && answer(false)}
    >
      <div role="alertdialog" aria-modal="true" aria-label={opts.title} className={`w-full max-w-md space-y-4 border bg-elev p-5 shadow-2xl ${accent}`}>
        <h2 className={opts.danger ? 'text-danger' : ''}>
          <span className="text-muted">{opts.danger ? '! ' : '? '}</span>
          {opts.title}
        </h2>
        {opts.message && <div className="text-muted">{opts.message}</div>}
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn" onClick={() => answer(false)}>
            {opts.cancelLabel ?? 'cancel'}
          </button>
          <button
            ref={okRef}
            type="button"
            className={`btn ${opts.danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => answer(true)}
          >
            {opts.confirmLabel ?? (opts.danger ? 'delete' : 'ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
