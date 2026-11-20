import { serverEventSchema, chatControlFrameSchema, type ChatClientFrame, type ServerEvent } from '@taskterm/shared';
import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';
import { refreshSession } from '../api/client';
import { useChatUi } from '../stores/chat';

type Handlers = {
  /** событие шины: chat_message / chat_deleted */
  onEvent: (e: ServerEvent) => void;
  /** (пере)подключились — пора догрузить пропущенное */
  onOpen: () => void;
  /** сервер отклонил кадр (слишком часто, пустое сообщение…) */
  onError: (message: string) => void;
};

let socket: WebSocket | null = null;

const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API_BASE}${API_ENDPOINTS.CHAT_WS}`;

/**
 * WebSocket общего чата с переподключением (1 с → 30 с). Закрытие кодом 4401 — сессия истекла: обмениваем refresh и пробуем снова.
 * Возвращает функцию остановки. Соединение одно на приложение (его держит Layout).
 */
export function startChatSocket(h: Handlers): () => void {
  let stopped = false;
  let backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const { setStatus } = useChatUi.getState();

  const connect = () => {
    if (stopped) return;
    setStatus('connecting');
    const ws = new WebSocket(url());
    socket = ws;
    ws.onmessage = (m) => {
      let data: unknown;
      try {
        data = JSON.parse(m.data as string);
      } catch {
        return;
      }
      const control = chatControlFrameSchema.safeParse(data);
      if (control.success) {
        if (control.data.type === 'ready') {
          backoff = 1000;
          setStatus('open');
          h.onOpen();
        } else h.onError(control.data.error);
        return;
      }
      const event = serverEventSchema.safeParse(data);
      if (event.success) h.onEvent(event.data);
    };
    ws.onclose = (e) => {
      if (socket === ws) socket = null;
      setStatus('closed');
      if (stopped) return;
      const retry = () => {
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
      if (e.code === 4401) void refreshSession().then((ok) => (ok ? connect() : retry()));
      else retry();
    };
  };
  connect();

  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
    socket = null;
    setStatus('closed');
  };
}

/** Отправить кадр; false — соединения нет */
export function sendChatFrame(frame: ChatClientFrame): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}
