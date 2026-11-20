import type { FastifyInstance } from 'fastify';
import type { ServerEvent } from '@taskterm/shared';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { accessibleBoardIds } from '../permissions/access';

/** События без привязки к доске (список пользователей, список досок, состав участников) доходят всем:
 *  они только сигнализируют «перезапроси», а сами данные клиент получает через API с проверкой прав. */
const hasBoard = (e: ServerEvent): e is Extract<ServerEvent, { boardId: number }> =>
  'boardId' in e && e.type !== 'members';

export async function eventRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;

  // закрывающие функции открытых SSE-соединений. Хук onClose регистрируем один раз здесь:
  // добавлять его внутри обработчика нельзя — после старта сервера addHook бросает ошибку
  const open = new Set<() => void>();
  app.addHook('onClose', async () => {
    for (const close of [...open]) close();
  });

  app.get('/api/events', { preHandler: requireUser(db) }, async (req, reply) => {
    const user = req.user;
    // доски, события которых можно показывать этому соединению (null — все, для админа)
    let allowed = await accessibleBoardIds(db, user);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    // события обрабатываем строго по очереди: пересчёт доступа не должен обгонять доставку
    let queue = Promise.resolve();
    const send = (event: ServerEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const handle = async (event: ServerEvent) => {
      if (event.type === 'chat_message' || event.type === 'chat_deleted') return; // чат живёт в своём WebSocket
      // состав досок изменился — обновляем список доступных до фильтрации
      if (event.type === 'boards' || event.type === 'members')
        allowed = await accessibleBoardIds(db, user);
      if (hasBoard(event) && allowed && !allowed.has(event.boardId)) return;
      send(event);
    };
    const unsubscribe = hub.subscribe((event) => {
      queue = queue.then(() => handle(event)).catch(() => { });
    });
    // блокировка/смена роли/удаление: соединение закрываем, клиент переподключится через refresh
    const unkick = hub.onKick((id) => {
      if (id === user.id) {
        cleanup();
        res.end();
      }
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      unkick();
      open.delete(close);
    };
    const close = () => {
      cleanup();
      res.end();
    };
    open.add(close);
    req.raw.on('close', cleanup);
  });
}
