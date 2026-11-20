import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { serverEventSchema, type ServerEvent, type User } from '@taskterm/shared';
import { showBrowserNotification } from '../lib/browserNotify';
import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';
import { ROUTES } from '../consts/routes';
import { meKey } from './auth';
import { boardKey, boardsKey, membersKey } from './boards';
import { refreshSession } from './client';
import { attachmentsKey } from './attachments';
import { subtasksKey } from './subtasks';
import { commentsKey } from './tasks';
import { usersKey } from './users';
import { timeKey } from './time';

function showNotification(e: Extract<ServerEvent, { type: 'notify' }>, open: () => void) {
  // не беспокоим, если пользователь прямо сейчас смотрит на эту задачу
  const viewing = document.hasFocus() && window.location.pathname === ROUTES.TASK(e.boardId, e.taskId);
  if (viewing) return;
  showBrowserNotification({
    title: `#${e.taskNumber} ${e.taskTitle}`,
    body:
      e.kind === 'assigned'
        ? `@${e.authorName} назначил(а) вас ответственным`
        : e.kind === 'unassigned'
          ? `@${e.authorName} снял(а) вас с задачи`
          : e.kind === 'subtask_assigned'
            ? `@${e.authorName} назначил(а) вас на подзадачу: ${e.snippet}`
            : e.kind === 'subtask_unassigned'
              ? `@${e.authorName} снял(а) вас с подзадачи: ${e.snippet}`
              : e.kind === 'subtask_done'
                ? `@${e.authorName} выполнил(а) подзадачу: ${e.snippet}`
                : e.kind === 'moved'
                  ? `@${e.authorName} перенёс(ла) задачу в «${e.columnName ?? ''}»`
                  : `@${e.authorName}: ${e.snippet}`,
    tag: `task-${e.taskId}`,
    open,
  });
}

/** Подписка на SSE: живое обновление кеша и браузерные уведомления */
export function useServerEvents(user: User) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let es: EventSource | null = null;
    let lost = false;
    let stopped = false;

    const connect = () => {
      es = new EventSource(`${API_BASE}${API_ENDPOINTS.EVENTS}`);
      wire(es);
    };

    const wire = (es: EventSource) => {
      es.onerror = () => {
        lost = true;
        // CLOSED — сервер ответил ошибкой (обычно 401: access-токен истёк), сам EventSource не переподключится.
        // CONNECTING — браузер уже пробует заново, ничего не делаем.
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        void refreshSession().then((ok) => {
          if (stopped) return;
          if (ok) connect();
          else qc.setQueryData(meKey, null); // сессия закончилась — показываем вход
        });
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
          case 'time':
            void qc.invalidateQueries({ queryKey: timeKey });
            break;
          case 'users':
            void qc.invalidateQueries({ queryKey: usersKey });
            break;
          case 'boards':
            void qc.invalidateQueries({ queryKey: boardsKey });
            break;
          case 'members':
          void qc.invalidateQueries({ queryKey: membersKey(e.boardId) });
          void qc.invalidateQueries({ queryKey: boardKey(e.boardId) });
          void qc.invalidateQueries({ queryKey: boardsKey });
          break;
        case 'board':
            void qc.invalidateQueries({ queryKey: boardKey(e.boardId) });
            break;
          case 'subtasks':
            void qc.invalidateQueries({ queryKey: subtasksKey(e.taskId) });
            break;
          case 'attachments':
            void qc.invalidateQueries({ queryKey: attachmentsKey(e.taskId) });
            void qc.invalidateQueries({ queryKey: boardKey(e.boardId) });
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
    };

    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [qc, user.id]);
}
