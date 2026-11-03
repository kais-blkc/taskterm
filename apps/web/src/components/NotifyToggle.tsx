import { useState } from 'react';
import { notificationsSupported, useNotifyStore } from '../stores/notifications';

export function NotifyToggle() {
  const { enabled, setEnabled } = useNotifyStore();
  const [, force] = useState(0);
  if (!notificationsSupported()) return null;

  const denied = Notification.permission === 'denied';
  const on = enabled && Notification.permission === 'granted';

  const toggle = async () => {
    if (on) return setEnabled(false);
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setEnabled(perm === 'granted');
    force((n) => n + 1);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={denied}
      title={denied ? 'уведомления заблокированы в настройках браузера' : 'уведомления о комментариях'}
      className={`notify-toggle btn ${on ? 'btn-active' : ''} disabled:cursor-not-allowed disabled:line-through`}
    >
      notify: {on ? 'on' : 'off'}
    </button>
  );
}
