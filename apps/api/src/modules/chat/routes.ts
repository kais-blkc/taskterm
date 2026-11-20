import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CHAT_PAGE_SIZE,
  chatClientFrameSchema,
  chatMessageSchema,
  chatRoomNameSchema,
  chatRoomSchema,
  chatStateSchema,
  idParamSchema,
  type ChatControlFrame,
  type ServerEvent,
} from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { errors, originAllowed } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { ACCESS_COOKIE, requireUser } from '../auth/guard';
import { authenticate } from '../auth/service';
import { createChatService } from './service';

/** Не больше N сообщений за окно: защита от флуда одним соединением */
const RATE_MAX = 20;
const RATE_WINDOW_MS = 10_000;
const PING_MS = 25_000;

const isChatEvent = (e: ServerEvent) => e.type === 'chat_message' || e.type === 'chat_deleted' || e.type === 'chat_rooms';

/**
 * Общий чат. История, состояние и удаление — обычные запросы (проверка прав как везде); отправка и «живые» сообщения —
 * по WebSocket `/api/chat/ws`. WebSocket не имеет своей логики: он вызывает те же сценарии сервиса и слушает ту же шину событий.
 */
export async function chatRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; config: Config }) {
  const { db, hub, config } = opts;
  const svc = createChatService(db);
  const r = app.withTypeProvider<ZodTypeProvider>();
  const err = errors(400, 401, 403, 404);

  r.get('/api/chat/state', { preHandler: requireUser(db), schema: { response: { 200: chatStateSchema, ...err } } }, (req) => svc.chatState(req.user));

  // ── темы (вкладки): читают все, меняет админ (проверка в сервисе) ──
  const user = requireUser(db);
  const roomParams = idParamSchema;
  r.get('/api/chat/rooms', { preHandler: user, schema: { response: { 200: z.array(chatRoomSchema), ...err } } }, (req) => svc.listRooms(req.user));

  r.post(
    '/api/chat/rooms',
    { preHandler: user, schema: { body: z.object({ name: chatRoomNameSchema }), response: { 201: z.object({ id: z.number().int() }), ...err } } },
    async (req, reply) => {
      const { id, events } = await svc.createRoom(req.user, req.body.name);
      hub.emitAll(events);
      return reply.code(201).send({ id });
    },
  );

  r.patch(
    '/api/chat/rooms/:id',
    { preHandler: user, schema: { params: roomParams, body: z.object({ name: chatRoomNameSchema }), response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      hub.emitAll((await svc.renameRoom(req.user, req.params.id, req.body.name)).events);
      return reply.code(204).send(null);
    },
  );

  r.post(
    '/api/chat/rooms/:id/move',
    { preHandler: user, schema: { params: roomParams, body: z.object({ beforeId: z.number().int().nullable() }), response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      hub.emitAll((await svc.moveRoom(req.user, req.params.id, req.body.beforeId)).events);
      return reply.code(204).send(null);
    },
  );

  r.delete('/api/chat/rooms/:id', { preHandler: user, schema: { params: roomParams, response: { 204: z.null(), ...err } } }, async (req, reply) => {
    hub.emitAll((await svc.deleteRoom(req.user, req.params.id)).events);
    return reply.code(204).send(null);
  });

  r.put(
    '/api/chat/rooms/:id/mute',
    { preHandler: user, schema: { params: roomParams, body: z.object({ muted: z.boolean() }), response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      await svc.setMuted(req.user, req.params.id, req.body.muted);
      return reply.code(204).send(null);
    },
  );

  r.get(
    '/api/chat/messages',
    {
      preHandler: requireUser(db),
      schema: {
        querystring: z.object({ roomId: z.coerce.number().int().optional(), before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(CHAT_PAGE_SIZE) }),
        response: { 200: z.object({ messages: z.array(chatMessageSchema), hasMore: z.boolean() }), ...err },
      },
    },
    (req) => svc.listMessages(req.user, req.query),
  );

  r.post(
    '/api/chat/read',
    { preHandler: requireUser(db), schema: { body: z.object({ roomId: z.number().int().optional() }), response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      await svc.markRead(req.user, req.body.roomId);
      return reply.code(204).send(null);
    },
  );

  r.delete('/api/chat/messages/:id', { preHandler: requireUser(db), schema: { params: idParamSchema, response: { 204: z.null(), ...err } } }, async (req, reply) => {
    hub.emitAll((await svc.deleteMessage(req.user, req.params.id)).events);
    return reply.code(204).send(null);
  });

  // ── WebSocket ──
  // Слушатели вешаем сразу (до проверки входа): иначе первые кадры клиента могли бы потеряться; обрабатываем их, когда вход подтверждён.
  app.get('/api/chat/ws', { websocket: true }, (socket, req) => {
    const sendFrame = (frame: ChatControlFrame | ServerEvent) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(frame));
    const user = originAllowed(req.headers, config.allowedOrigins)
      ? authenticate(db, req.server.jwtSecret, req.cookies[ACCESS_COOKIE] ?? '')
      : Promise.resolve(null);

    let stop = () => {};
    let sent: number[] = [];
    let alive = true;
    const ready = user.then((u) => {
      if (!u) {
        socket.close(4401, 'not authenticated');
        return null;
      }
      const unsubscribe = hub.subscribe((e) => isChatEvent(e) && sendFrame(e));
      const unkick = hub.onKick((id) => id === u.id && socket.close(4401, 'session closed'));
      const ping = setInterval(() => {
        if (!alive) return socket.terminate();
        alive = false;
        socket.ping();
      }, PING_MS);
      stop = () => {
        unsubscribe();
        unkick();
        clearInterval(ping);
      };
      sendFrame({ type: 'ready' });
      return u;
    });

    socket.on('pong', () => (alive = true));
    socket.on('close', () => stop());
    socket.on('message', (raw: Buffer) => {
      void ready.then(async (u) => {
        if (!u) return;
        const frame = chatClientFrameSchema.safeParse(safeJson(raw.toString()));
        if (!frame.success) return sendFrame({ type: 'error', error: 'некорректное сообщение' });
        try {
          if (frame.data.type === 'read') return await svc.markRead(u, frame.data.roomId);
          const now = Date.now();
          sent = sent.filter((t) => now - t < RATE_WINDOW_MS);
          if (sent.length >= RATE_MAX) return sendFrame({ type: 'error', error: 'слишком часто, подождите несколько секунд' });
          sent.push(now);
          hub.emitAll((await svc.sendMessage(u, frame.data.roomId, frame.data.text)).events); // рассылку (и отправителю тоже) делает подписка выше
        } catch (e) {
          sendFrame({ type: 'error', error: (e as Error).message });
        }
      });
    });
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
