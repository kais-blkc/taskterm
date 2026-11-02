import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, credentialsSchema, userSchema } from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { SESSION_COOKIE } from './guard';
import { safeEqual } from './password';
import { AuthError, SESSION_TTL_MS, destroySession, login, register, userByToken } from './service';


export async function authRoutes(app: FastifyInstance, opts: { db: Db; config: Config; hub: EventHub }) {
  const { db, config, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  const setCookie = (reply: import('fastify').FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });

  const errors = { 401: apiErrorSchema, 409: apiErrorSchema };

  for (const action of ['register', 'login'] as const) {
    r.post(
      `/api/auth/${action}`,
      { schema: { body: credentialsSchema, response: { 200: userSchema, ...errors } } },
      async (req, reply) => {
        const { username, password, accessPassword } = req.body;
        if (!safeEqual(accessPassword, config.accessPassword)) {
          return reply.code(401).send({ error: 'invalid access password' });
        }
        try {
          const fn = action === 'register' ? register : login;
          const { user, token } = await fn(db, username, password);
          setCookie(reply, token);
          if (action === 'register') hub.emit({ type: 'users', by: user.id });
          return user;
        } catch (e) {
          if (e instanceof AuthError) return reply.code(e.status as 401 | 409).send({ error: e.message });
          throw e;
        }
      },
    );
  }

  r.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await destroySession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  r.get(
    '/api/auth/me',
    { schema: { response: { 200: userSchema, 401: apiErrorSchema } } },
    async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      const user = token ? await userByToken(db, token) : null;
      if (!user) return reply.code(401).send({ error: 'not authenticated' });
      return user;
    },
  );
}
