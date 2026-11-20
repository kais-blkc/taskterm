import { useNotifySettings, useSaveNotifySettings } from '../../api/admin';

/** Настройки уведомлений приложения. Сейчас одна: слать админам, когда отмечают подзадачу выполненной (по умолчанию включено). */
export function NotifySettings() {
  const settings = useNotifySettings();
  const save = useSaveNotifySettings();
  const on = settings.data?.subtaskDone ?? true;

  return (
    <div className="admin-notify-settings space-y-2 border border-line bg-elev p-4">
      <h2 className="admin-notify-title">## уведомления</h2>
      <button
        type="button"
        className={`admin-notify-subtask-done btn ${on ? 'btn-active' : ''}`}
        aria-pressed={on}
        disabled={settings.isLoading || save.isPending}
        onClick={() => save.mutate({ subtaskDone: !on })}
      >
        [{on ? 'x' : ' '}] подзадача выполнена
      </button>
      <p className="admin-notify-hint text-[14px] text-muted">// когда кто-то отмечает подзадачу выполненной, админам приходит уведомление в браузер и Telegram (отметивший его не получает)</p>
      {save.error && <p role="alert" className="admin-notify-error text-danger">! {save.error.message}</p>}
    </div>
  );
}
