import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { chatMessageSchema, chatRoomSchema, chatSettingsSchema, chatStateSchema, type ChatMessage, type ChatRoom, type ChatSettings, type Me } from '@taskterm/shared';
import { z } from 'zod';
import { API_ENDPOINTS } from '../consts/endpoints';
import { ROUTES } from '../consts/routes';
import { showBrowserNotification } from '../lib/browserNotify';
import { startChatSocket, sendChatFrame } from '../lib/chatSocket';
import { playMessageSound } from '../lib/sound';
import { useChatUi } from '../stores/chat';
import { api } from './client';
import { usersKey } from './users';

export const chatStateKey = ['chat', 'state'] as const;
export const chatRoomsKey = ['chat', 'rooms'] as const;
export const chatMessagesKey = ['chat', 'messages'] as const;
/** История «Все» — ключ 'all', темы — её id */
const messagesKeyOf = (roomId?: number) => [...chatMessagesKey, roomId ?? 'all'] as const;
export const chatSettingsKey = ['admin', 'chat-settings'] as const;

const pageSchema = z.object({ messages: z.array(chatMessageSchema), hasMore: z.boolean() });
type Page = z.infer<typeof pageSchema>;
type Pages = InfiniteData<Page, number | undefined>;

export function useChatState() {
  return useQuery({
    queryKey: chatStateKey,
    queryFn: async () => chatStateSchema.parse(await api(API_ENDPOINTS.CHAT_STATE)),
  });
}

/** Темы (вкладки) с моими «не прочитано» и «без звука» */
export function useChatRooms() {
  return useQuery({
    queryKey: chatRoomsKey,
    queryFn: async () => z.array(chatRoomSchema).parse(await api(API_ENDPOINTS.CHAT_ROOMS)),
  });
}

/** Сумма непрочитанных по темам, не «без звука» — число в шапке */
export function useChatUnread(): number {
  return (useChatRooms().data ?? []).reduce((n, r) => n + (r.muted ? 0 : r.unread), 0);
}

/**
 * История темы (roomId) или всех тем сразу («Все»): первая страница — самые новые, «ещё» подгружает старее
 * (курсор before = id самого старого из загруженных)
 */
export function useChatMessages(roomId?: number) {
  const query = useInfiniteQuery({
    queryKey: messagesKeyOf(roomId),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      if (roomId) q.set('roomId', String(roomId));
      if (pageParam) q.set('before', String(pageParam));
      return pageSchema.parse(await api(`${API_ENDPOINTS.CHAT_MESSAGES}${q.size ? `?${q}` : ''}`));
    },
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
  });
  // страницы идут от новых к старым, внутри страницы — по возрастанию; показываем всё подряд по возрастанию
  const messages: ChatMessage[] = [...(query.data?.pages ?? [])].reverse().flatMap((p) => p.messages);
  return { ...query, messages };
}

export function useDeleteChatMessage() {
  return useMutation({ mutationFn: (id: number) => api<void>(API_ENDPOINTS.CHAT_MESSAGE_ITEM(id), { method: 'DELETE' }) });
}

/** «Без звука» для темы: меняется в кэше сразу */
export function useMuteChatRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; muted: boolean }) => api<void>(API_ENDPOINTS.CHAT_ROOM_MUTE(v.id), { method: 'PUT', body: { muted: v.muted } }),
    onMutate: (v) => patchRooms(qc, (rooms) => rooms.map((r) => (r.id === v.id ? { ...r, muted: v.muted } : r))),
    onSettled: () => qc.invalidateQueries({ queryKey: chatRoomsKey }),
  });
}

/** Управление темами (админ): создать, переименовать, переставить, удалить */
export function useChatRoomMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: chatRoomsKey });
  return {
    create: useMutation({ mutationFn: (name: string) => api(API_ENDPOINTS.CHAT_ROOMS, { method: 'POST', body: { name } }), onSuccess: refresh }),
    rename: useMutation({ mutationFn: (v: { id: number; name: string }) => api<void>(API_ENDPOINTS.CHAT_ROOM_ITEM(v.id), { method: 'PATCH', body: { name: v.name } }), onSuccess: refresh }),
    move: useMutation({ mutationFn: (v: { id: number; beforeId: number | null }) => api<void>(API_ENDPOINTS.CHAT_ROOM_MOVE(v.id), { method: 'POST', body: { beforeId: v.beforeId } }), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(API_ENDPOINTS.CHAT_ROOM_ITEM(id), { method: 'DELETE' }),
      onSuccess: () => {
        void refresh();
        void qc.invalidateQueries({ queryKey: chatMessagesKey });
      },
    }),
  };
}

export function useChatSettings() {
  return useQuery({
    queryKey: chatSettingsKey,
    queryFn: async () => chatSettingsSchema.parse(await api(API_ENDPOINTS.ADMIN_CHAT_SETTINGS)),
  });
}

export function useSaveChatSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChatSettings) => chatSettingsSchema.parse(await api(API_ENDPOINTS.ADMIN_CHAT_SETTINGS, { method: 'PUT', body: input })),
    onSuccess: (data) => {
      qc.setQueryData(chatSettingsKey, data);
      void qc.invalidateQueries({ queryKey: chatStateKey });
    },
  });
}

/** Отправить сообщение в тему по WebSocket; false — нет связи */
export const sendChatMessage = (roomId: number, text: string) => sendChatFrame({ type: 'send', roomId, text });

const patchRooms = (qc: QueryClient, f: (rooms: ChatRoom[]) => ChatRoom[]) => qc.setQueryData<ChatRoom[]>(chatRoomsKey, (old) => old && f(old));

/** Всё прочитано в теме (без roomId — во всех): на сервере и сразу в счётчиках */
export function markChatRead(qc: QueryClient, roomId?: number) {
  const unread = (qc.getQueryData<ChatRoom[]>(chatRoomsKey) ?? []).some((r) => (roomId ? r.id === roomId : true) && r.unread > 0);
  if (!unread) return;
  patchRooms(qc, (rooms) => rooms.map((r) => (!roomId || r.id === roomId ? { ...r, unread: 0 } : r)));
  sendChatFrame({ type: 'read', roomId });
}

/** Новое сообщение — в историю «Все» и своей темы (если они загружены) */
const withMessage = (qc: QueryClient, message: ChatMessage) => {
  for (const key of [messagesKeyOf(), messagesKeyOf(message.roomId)]) {
    qc.setQueryData<Pages>(key, (old) => {
      if (!old) return old;
      const [newest, ...rest] = old.pages;
      if (!newest || newest.messages.some((m) => m.id === message.id)) return old;
      return { ...old, pages: [{ ...newest, messages: [...newest.messages, message] }, ...rest] };
    });
  }
};

/** Удалённое сообщение — из всех загруженных историй */
const withoutMessage = (qc: QueryClient, id: number) =>
  qc.setQueriesData<Pages>({ queryKey: chatMessagesKey }, (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== id) })) });

/** Какую вкладку чата смотрят прямо сейчас: undefined — не на странице чата / окно не в фокусе; null — «Все»; число — тема */
function viewedRoom(): number | null | undefined {
  if (!document.hasFocus() || window.location.pathname !== ROUTES.CHAT) return undefined;
  const room = Number(new URLSearchParams(window.location.search).get('room'));
  return room || null;
}

/**
 * Держит WebSocket чата, пока пользователь вошёл: новые сообщения попадают в кэш, считаются непрочитанные по темам,
 * приходят браузерное уведомление и звук (если сообщение не в открытой вкладке и тема не «без звука»).
 */
export function useChatConnection(me: Me) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useChatRooms(); // счётчики для шапки подгружаем сразу после входа

  useEffect(() => {
    return startChatSocket({
      onOpen: () => {
        // могли пропустить сообщения, пока не было связи
        void qc.invalidateQueries({ queryKey: chatMessagesKey });
        void qc.invalidateQueries({ queryKey: chatRoomsKey });
        void qc.invalidateQueries({ queryKey: chatStateKey });
      },
      onError: () => {},
      onEvent: (e) => {
        if (e.type === 'chat_rooms') {
          void qc.invalidateQueries({ queryKey: chatRoomsKey });
          void qc.invalidateQueries({ queryKey: chatMessagesKey });
        } else if (e.type === 'chat_deleted') {
          withoutMessage(qc, e.id);
          void qc.invalidateQueries({ queryKey: chatRoomsKey });
        } else if (e.type === 'chat_message') {
          const m = e.message;
          withMessage(qc, m);
          if (m.authorId === me.id) return;
          const viewed = viewedRoom();
          if (viewed !== undefined && (viewed === null || viewed === m.roomId)) {
            sendChatFrame({ type: 'read', roomId: m.roomId });
            return;
          }
          const room = qc.getQueryData<ChatRoom[]>(chatRoomsKey)?.find((r) => r.id === m.roomId);
          patchRooms(qc, (rooms) => rooms.map((r) => (r.id === m.roomId ? { ...r, unread: r.unread + 1 } : r)));
          if (room?.muted) return; // «без звука»: счётчик вырос, а шума нет
          if (useChatUi.getState().soundEnabled) playMessageSound();
          const author = qc.getQueryData<{ id: number; username: string }[]>(usersKey)?.find((u) => u.id === m.authorId);
          showBrowserNotification({
            title: `Чат${room ? ` · ${room.name}` : ''}`,
            body: `@${author?.username ?? 'удалён'}: ${m.text.slice(0, 140)}`,
            tag: `chat-${m.roomId}`,
            open: () => navigateRef.current(`${ROUTES.CHAT}?room=${m.roomId}`),
          });
        }
      },
    });
  }, [qc, me.id]);
}
