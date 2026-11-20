import { useLocation } from 'react-router-dom';
import { useChatUnread } from '../api/chat';
import { ROUTES } from '../consts/routes';
import { useBack } from '../lib/useBack';
import { NavButton } from './nav/NavButton';

/** Пункт «чат» (в шапке всегда на виду, вне бургера): значок непрочитанных; на странице чата возвращает назад */
export function ChatButton() {
  const unread = useChatUnread();
  const active = useLocation().pathname === ROUTES.CHAT;
  const back = useBack();
  const badge = unread > 0 && (
    <span className="chat-unread-badge ml-1 min-w-[1.4em] bg-accent px-1 text-center text-[12px] leading-[1.4] text-bg" aria-label={`непрочитанных: ${unread}`}>
      {unread > 99 ? '99+' : unread}
    </span>
  );
  return active ? (
    <NavButton icon="chat" label="чат" title="вернуться на предыдущую страницу" active badge={badge} collapsedBadge={badge} showIconInBar className="chat-button" onClick={back} />
  ) : (
    <NavButton icon="chat" label="чат" title="общий чат" badge={badge} collapsedBadge={badge} showIconInBar className="chat-button" to={ROUTES.CHAT} />
  );
}
