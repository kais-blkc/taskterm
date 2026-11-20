import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hexColorSchema, userSchema } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';
import { createUserService } from './service';

export async function userRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));
  const svc = createUserService(db);

  r.get('/api/users', { schema: { response: { 200: z.array(userSchema) } } }, () => svc.listUsers());

  r.patch(
    '/api/users/me/color',
    { schema: { body: z.object({ color: hexColorSchema }), response: { 200: userSchema, ...errors(409) } } },
    async (req) => {
      const user = await svc.setColor(req.user.id, req.body.color);
      hub.emit({ type: 'users', by: req.user.id });
      return user;
    },
  );
}
