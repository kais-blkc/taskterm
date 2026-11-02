import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { asc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { apiErrorSchema, findSimilar, hexColorSchema, userSchema } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';
import type { EventHub } from '../../plugins/hub';
import { requireUser } from '../auth/guard';

export async function userRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub }) {
  const { db, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook('preHandler', requireUser(db));

  const cols = { id: users.id, username: users.username, color: users.color };

  // список для выбора исполнителя; password_hash наружу не отдаём
  r.get('/api/users', { schema: { response: { 200: z.array(userSchema) } } }, async () =>
    db.select(cols).from(users).orderBy(asc(users.username)).all(),
  );

  r.patch(
    '/api/users/me/color',
    {
      schema: {
        body: z.object({ color: hexColorSchema }),
        response: { 200: userSchema, 409: apiErrorSchema },
      },
    },
    async (req, reply) => {
      const color = req.body.color.toLowerCase();
      const others = db.select(cols).from(users).where(ne(users.id, req.user.id)).all();
      const clash = findSimilar(color, others);
      if (clash) return reply.code(409).send({ error: `слишком похож на цвет @${clash.username}` });

      const row = db.update(users).set({ color }).where(eq(users.id, req.user.id)).returning(cols).get();
      hub.emit({ type: 'users', by: req.user.id });
      return row!;
    },
  );
}
