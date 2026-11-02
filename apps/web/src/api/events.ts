import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { serverEventSchema, type ServerEvent, type User } from '@taskterm/shared';
import { notificationsSupported, useNotifyStore } from '../stores/notifications';
import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';
import { ROUTES } from '../consts/routes';
import { boardKey, boardsKey } from './boards';
import { subtasksKey } from './subtasks';
import { commentsKey } from './tasks';
import { usersKey } from './users';

function showNotification(e: Extract<ServerEvent, { type: 'notify' }>, open: () => void) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (!useNotifyStore.getState().enabled) return;
  // не беспокоим, если пользователь прямо сейчас смотрит на эту задачу
  const viewing = document.hasFocus() && window.location.pathname === ROUTES.TASK(e.boardId, e.taskId);
  if (viewing) return;

  const n = new Notification(`#${e.taskNumber} ${e.taskTitle}`, {
    body: e.kind === 'assigned' ? `@${e.authorName} назначил(а) вас ответственным` : `@${e.authorName}: ${e.snippet}`,
    tag: `task-${e.taskId}`,
  });
  n.onclick = () => {
    window.focus();
    open();
    n.close();
  };
}

/** Подписка на SSE: живое обновление кеша и браузерные уведомления */
export function useServerEvents(user: User) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const es = new EventSource(`${API_BASE}${API_ENDPOINTS.EVENTS}`);
    let lost = false;

    es.onerror = () => {
      lost = true; // EventSource переподключится сам
    };
    es.onopen = () => {
      // могли пропустить события, пока не было связи
      if (lost) {
        lost = false;
        void qc.invalidateQueries();
      }
    };
    es.onmessage = (msg) => {
      const parsed = serverEventSchema.safeParse(JSON.parse(msg.data));
      if (!parsed.success) return;
      const e = parsed.data;
      if (e.by === user.id) return; // свои изменения уже применены локально

      switch (e.type) {
        case 'users':
          void qc.invalidateQueries({ queryKey: usersKey });
          break;
        case 'boards':
          void qc.invalidateQueries({ queryKey: boardsKey });
          break;
        case 'board':
          void qc.invalidateQueries({ queryKey: boardKey(e.boardId) });
          break;
        case 'subtasks':
          void qc.invalidateQueries({ queryKey: subtasksKey(e.taskId) });
          break;
        case 'comments':
          void qc.invalidateQueries({ queryKey: commentsKey(e.taskId) });
          break;
        case 'notify':
          if (e.recipients.includes(user.id)) {
            showNotification(e, () => navigateRef.current(ROUTES.TASK(e.boardId, e.taskId)));
          }
          break;
      }
    };
    return () => es.close();
  }, [qc, user.id]);
}
