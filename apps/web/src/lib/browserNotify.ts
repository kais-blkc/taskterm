import { notificationsSupported, useNotifyStore } from '../stores/notifications';

/**
 * Браузерное уведомление (если пользователь их включил и разрешил). Клик возвращает фокус окну и вызывает `open`.
 * Единая точка для уведомлений о задачах и о чате.
 */
export function showBrowserNotification(opts: { title: string; body: string; tag: string; open: () => void }): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (!useNotifyStore.getState().enabled) return;
  const n = new Notification(opts.title, { body: opts.body, tag: opts.tag });
  n.onclick = () => {
    window.focus();
    opts.open();
    n.close();
  };
}
