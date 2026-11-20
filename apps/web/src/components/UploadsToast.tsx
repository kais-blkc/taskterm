import { useUploads } from '../stores/uploads';

/** Плашка слева внизу: идущие загрузки и ошибки — видны, даже если окно задачи закрыто (файлы при создании задачи грузятся в фоне) */
export function UploadsToast() {
  const items = useUploads((s) => s.items);
  const remove = useUploads((s) => s.remove);
  // в окне задачи те же загрузки видны подробнее; тут показываем сводку
  const active = items.filter((i) => i.status === 'preparing' || i.status === 'uploading');
  const failed = items.filter((i) => i.status === 'error');
  if (!active.length && !failed.length) return null;
  return (
    <div className="uploads-toast fixed bottom-3 left-[calc(var(--nav-left,0px)+0.75rem)] z-50 w-72 max-w-[calc(100vw-1.5rem)] space-y-1 border border-line bg-elev p-2 text-[14px] shadow-2xl" role="status" aria-live="polite">
      {active.length > 0 && (
        <div className="uploads-toast-active flex items-center justify-between gap-2">
          <span>загрузка файлов: {active.length}</span>
          <span className="tabular-nums text-muted">{Math.round(active.reduce((a, i) => a + i.progress, 0) / active.length)}%</span>
        </div>
      )}
      {failed.map((i) => (
        <div key={i.id} className="uploads-toast-error flex items-start gap-2 text-danger">
          <span className="min-w-0 flex-1 break-words">
            ! {i.name}: {i.error}
          </span>
          <button type="button" className="btn btn-icon shrink-0" aria-label="убрать" onClick={() => remove(i.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
