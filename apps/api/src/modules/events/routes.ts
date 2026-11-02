import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';

export async function eventRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;

  app.get('/api/events', { preHandler: requireUser(db) }, async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const unsubscribe = hub.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.on('close', cleanup);
    app.addHook('onClose', async () => {
      cleanup();
      res.end();
    });
  });
}
