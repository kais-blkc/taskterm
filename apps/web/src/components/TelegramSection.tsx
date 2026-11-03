import { useEffect, useState } from 'react';
import { useTelegram, useTelegramMutations } from '../api/telegram';
import { confirmDialog } from '../stores/confirm';

/** Привязка Telegram в меню профиля: ссылка на бота с одноразовым кодом, статус, отключение */
export function TelegramSection() {
  const [url, setUrl] = useState<string | null>(null);
  const status = useTelegram(url !== null);
  const m = useTelegramMutations();
  const linked = status.data?.linked ?? false;

  // привязка завершилась — прячем ссылку
  useEffect(() => {
    if (linked) setUrl(null);
  }, [linked]);

  if (!status.data?.enabled) return null;
  const error = m.link.error ?? m.unlink.error;

  return (
    <div className="telegram-section space-y-2 border-t border-line pt-3">
      <div className="text-muted">Telegram</div>
      {linked ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-accent">подключён</span>
          <button
            type="button"
            className="btn btn-danger"
            disabled={m.unlink.isPending}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Отключить Telegram?',
                message: 'Уведомления о комментариях и назначениях перестанут приходить в чат.',
                confirmLabel: 'отключить',
                danger: true,
              });
              if (ok) m.unlink.mutate();
            }}
          >
            отключить
          </button>
        </div>
      ) : url ? (
        <div className="space-y-2">
          <a href={url} target="_blank" rel="noreferrer" className="telegram-open btn btn-primary">
            открыть бота
          </a>
          <p className="text-[14px] text-muted">В боте нажмите Start. Ссылка действует 10 минут, ждём подтверждения…</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn"
            disabled={m.link.isPending}
            onClick={() => m.link.mutate(undefined, { onSuccess: (r) => setUrl(r.url) })}
          >
            подключить Telegram
          </button>
          <p className="text-[14px] text-muted">комментарии и назначения будут приходить в личные сообщения</p>
        </>
      )}
      {error && <p className="text-danger">! {error.message}</p>}
    </div>
  );
}
