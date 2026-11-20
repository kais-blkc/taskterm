import { useState } from 'react';
import { notificationsSupported, useNotifyStore } from '../stores/notifications';
import { NavButton } from './nav/NavButton';

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
    <NavButton
      icon="bell"
      label="уведомления"
      aria-pressed={on}
      badge={<span className="notify-state ml-1 text-muted">{on ? 'вкл' : 'выкл'}</span>}
      title={denied ? 'уведомления заблокированы в настройках браузера' : 'уведомления о комментариях и чате'}
      active={on}
      disabled={denied}
      className={`notify-toggle ${denied ? 'line-through' : ''}`}
      onClick={toggle}
    />
  );
}
