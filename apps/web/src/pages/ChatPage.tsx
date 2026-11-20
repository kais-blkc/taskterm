import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CHAT_MAX_LENGTH, canDeleteChatMessage, isAdminRole, type ChatMessage as Message, type ChatRoom, type Me } from '@taskterm/shared';
import { markChatRead, sendChatMessage, useChatMessages, useChatRooms, useChatState, useDeleteChatMessage, useMuteChatRoom } from '../api/chat';
import { useUsers } from '../api/users';
import { Icon } from '../components/Icon';
import { MessageForm } from '../components/MessageForm';
import { Select } from '../components/Select';
import { UserTag } from '../components/UserTag';
import { ROUTES } from '../consts/routes';
import { formatDateTime } from '../lib/dates';
import { isTyping } from '../lib/keys';
import { useBack } from '../lib/useBack';
import { useChatUi } from '../stores/chat';
import { confirmDialog } from '../stores/confirm';

/** День сообщения (локальный) — для разделителей в ленте */
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** Вкладки как в группе Telegram: «Все» (лента всех тем) и темы со счётчиками непрочитанных */
function Tabs({ rooms, current, onSelect }: { rooms: ChatRoom[]; current: number | null; onSelect: (id: number | null) => void }) {
  const total = rooms.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0);
  const tab = (active: boolean, cls: string, label: React.ReactNode, unread: number, muted: boolean, onClick: () => void, key?: number) => (
    <button
      key={key ?? 'all'}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`chat-tab ${cls} flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap border-b-2 px-3 py-1.5 ${
        active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg'
      }`}
    >
      {label}
      {unread > 0 && (
        <span className={`chat-tab-unread min-w-[1.4em] px-1 text-center text-[12px] leading-[1.4] ${muted ? 'border border-line text-muted' : 'bg-accent text-bg'}`}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
  return (
    <div role="tablist" aria-label="темы чата" className="chat-tabs flex overflow-x-auto border border-line bg-elev">
      {tab(current === null, 'chat-tab-all', 'Все', total, false, () => onSelect(null))}
      {rooms.map((r) =>
        tab(
          current === r.id,
          'chat-tab-room',
          <>
            {r.isGeneral && <Icon name="pin" className="text-muted" />}
            {r.name}
          </>,
          r.unread,
          r.muted,
          () => onSelect(r.id),
          r.id,
        ),
      )}
    </div>
  );
}

function MessageRow({ m, roomName, canDelete, onDelete, onOpenRoom }: { m: Message; roomName?: string; canDelete: boolean; onDelete: () => void; onOpenRoom: () => void }) {
  const author = useUsers().byId.get(m.authorId ?? -1);
  return (
    <li className="chat-message group flex items-start gap-2 px-1 py-1 hover:bg-elev" title={formatDateTime(m.createdAt)}>
      <span className="chat-message-time w-11 shrink-0 pt-[1px] text-right text-xs tabular-nums text-muted">{timeOf(m.createdAt)}</span>
      <div className="chat-message-body min-w-0 flex-1">
        {roomName && (
          // во вкладке «Все» видно, из какой темы сообщение; клик открывает тему
          <button type="button" className="chat-message-room mr-1 cursor-pointer border border-line px-1 text-xs text-muted hover:border-accent hover:text-accent" onClick={onOpenRoom}>
            {roomName}
          </button>
        )}
        <UserTag user={author} fallback="удалён" className="chat-message-author" />{' '}
        <span className="chat-message-text whitespace-pre-wrap break-words">{m.text}</span>
      </div>
      {canDelete && (
        <button
          type="button"
          className="chat-message-delete btn btn-danger btn-icon invisible group-focus-within:visible group-hover:visible [@media(hover:none)]:visible"
          title="удалить сообщение"
          aria-label="удалить сообщение"
          onClick={onDelete}
        >
          ×
        </button>
      )}
    </li>
  );
}

/**
 * Общий чат с темами-вкладками. Тема выбирается в адресе (`/chat?room=3`, без параметра — «Все»), поэтому «назад» и ссылки работают.
 * Новые сообщения приходят по WebSocket (api/chat.ts).
 */
export function ChatPage({ user }: { user: Me }) {
  const back = useBack();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rooms = useChatRooms().data ?? [];
  const roomId = Number(params.get('room')) || null;
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const current = room ? room.id : null; // неизвестная/удалённая тема → «Все»
  const state = useChatState();
  const { messages, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading, error } = useChatMessages(current ?? undefined);
  const del = useDeleteChatMessage();
  const mute = useMuteChatRoom();
  const status = useChatUi((s) => s.status);
  const soundEnabled = useChatUi((s) => s.soundEnabled);
  const setSoundEnabled = useChatUi((s) => s.setSoundEnabled);
  const general = rooms.find((r) => r.isGeneral);
  // во «Все» пишем в выбранную тему (по умолчанию General)
  const [target, setTarget] = useState<number | null>(null);
  const writeTo = current ?? target ?? general?.id ?? null;
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // пока прокручено «до низа», новые сообщения прокручивают ленту
  const prevHeight = useRef(0);
  const lastId = messages.at(-1)?.id;
  const select = (id: number | null) => setParams(id ? { room: String(id) } : {}, { replace: true });

  // Esc — назад (если не вводим текст)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTyping() && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // вкладка открыта и окно в фокусе — всё в ней прочитано
  useEffect(() => {
    const read = () => document.hasFocus() && markChatRead(qc, current ?? undefined);
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [qc, current, lastId, status]);

  // прокрутка: к низу при открытии, смене вкладки и новых сообщениях; при подгрузке старых — остаёмся на месте
  useEffect(() => {
    stick.current = true;
    prevHeight.current = 0;
  }, [current]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (prevHeight.current && !stick.current) el.scrollTop += el.scrollHeight - prevHeight.current;
    else if (stick.current) el.scrollTop = el.scrollHeight;
    prevHeight.current = el.scrollHeight;
  }, [messages.length, lastId, current]);

  const connected = status === 'open';
  const nameOf = (id: number) => rooms.find((r) => r.id === id)?.name ?? '?';
  let lastDay = '';
  return (
    <div className="chat-page mx-auto flex h-[calc(100dvh-var(--app-header,3.25rem))] max-w-3xl flex-col gap-2 p-3 sm:p-4">
      <div className="chat-header flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="chat-back btn" onClick={back} title="на предыдущую страницу (Esc)">
            ← назад
          </button>
          <h1 className="chat-title page-title">## чат</h1>
          {isAdminRole(user.role) && (
            <Link to={`${ROUTES.ADMIN}?tab=chat`} className="chat-manage text-[14px] text-muted hover:text-accent" title="создать, переименовать и переставить темы">
              темы…
            </Link>
          )}
        </div>
        <div className="chat-tools flex flex-wrap items-center gap-2 text-[14px]">
          <span className={`chat-status ${connected ? 'text-accent' : 'text-danger'}`} role="status">
            {connected ? '● на связи' : status === 'connecting' ? '○ подключение…' : '○ нет связи'}
          </span>
          {room && (
            // личная настройка темы: звук, браузерные уведомления и Telegram молчат, счётчик остаётся
            <button
              type="button"
              aria-pressed={room.muted}
              className={`chat-mute btn ${room.muted ? 'btn-active' : ''}`}
              title="тема без звука: нет звука, браузерных уведомлений и Telegram"
              disabled={mute.isPending}
              onClick={() => mute.mutate({ id: room.id, muted: !room.muted })}
            >
              без звука: {room.muted ? 'вкл' : 'выкл'}
            </button>
          )}
          <button
            type="button"
            aria-pressed={soundEnabled}
            className={`chat-sound btn ${soundEnabled ? 'btn-active' : ''}`}
            title="звук при новых сообщениях, когда они не в открытой вкладке"
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            звук: {soundEnabled ? 'вкл' : 'выкл'}
          </button>
        </div>
      </div>

      <Tabs rooms={rooms} current={current} onSelect={select} />

      <div
        ref={list}
        className="chat-list min-h-0 flex-1 overflow-y-auto border border-line bg-bg p-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasNextPage && (
          <button type="button" className="chat-more btn mx-auto mb-2 block" disabled={isFetchingNextPage} onClick={() => ((prevHeight.current = list.current?.scrollHeight ?? 0), (stick.current = false), void fetchNextPage())}>
            {isFetchingNextPage ? 'Загрузка…' : 'показать более старые'}
          </button>
        )}
        {isLoading && <p className="chat-loading text-muted">Загрузка…</p>}
        {error && <p role="alert" className="chat-error text-danger">! не удалось загрузить чат</p>}
        {!isLoading && messages.length === 0 && <p className="chat-empty text-muted text-[14px]">// сообщений пока нет — напишите первым</p>}
        <ul className="chat-messages space-y-0.5">
          {messages.map((m) => {
            const day = dayOf(m.createdAt);
            const separator = day !== lastDay;
            lastDay = day;
            return (
              <Fragment key={m.id}>
                {separator && (
                  <li role="presentation" className="chat-day my-2 text-center text-xs text-muted">
                    — {day} —
                  </li>
                )}
                <MessageRow
                  m={m}
                  roomName={current === null ? nameOf(m.roomId) : undefined}
                  onOpenRoom={() => select(m.roomId)}
                  canDelete={!!state.data && canDeleteChatMessage(state.data, user, m)}
                  onDelete={async () => {
                    if (await confirmDialog({ title: 'Удалить сообщение?', message: 'Оно исчезнет у всех участников.', danger: true })) del.mutate(m.id);
                  }}
                />
              </Fragment>
            );
          })}
        </ul>
      </div>

      {del.error && <p role="alert" className="chat-error text-danger">! {del.error.message}</p>}
      {current === null && (
        // лента «Все»: куда уйдёт сообщение — выбираем рядом с полем
        <div className="chat-target flex items-center gap-2 text-[14px] text-muted">
          <span>в тему:</span>
          <Select className="chat-target-select w-48" value={writeTo ? String(writeTo) : ''} options={rooms.map((r) => ({ value: String(r.id), label: r.name }))} onChange={(v) => setTarget(Number(v))} />
        </div>
      )}
      <MessageForm
        className="chat-form"
        rows={2}
        submitOnEnter
        maxLength={CHAT_MAX_LENGTH}
        disabled={!connected || !writeTo}
        placeholder={connected ? 'сообщение, enter — отправить, shift+enter — новая строка' : 'нет связи с сервером…'}
        submitLabel="отправить"
        onSubmit={(text) => writeTo && sendChatMessage(writeTo, text)}
      />
    </div>
  );
}
