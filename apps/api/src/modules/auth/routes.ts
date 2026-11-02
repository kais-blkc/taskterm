import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { apiErrorSchema, credentialsSchema, loginSchema, meSchema } from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { FailureThrottle } from '../../plugins/throttle';
import { ACCESS_COOKIE, REFRESH_COOKIE, requireUser } from './guard';
import { safeEqual } from './password';
import {
  AuthError,
  endAllSessions,
  endSession,
  refreshSession,
  register,
  startSession,
  toAuthUser,
  verifyLogin,
  type Session,
} from './service';
import { ACCESS_TTL_SEC, REFRESH_TTL_MS } from './tokens';

export async function authRoutes(app: FastifyInstance, opts: { db: Db; config: Config; hub: EventHub }) {
  const { db, config, hub } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const secret = config.jwtSecret;
  const throttle = new FailureThrottle(config.loginFailMax, 15 * 60_000);

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.secureCookies } as const;
  const setCookies = (reply: FastifyReply, s: Session) => {
    reply.setCookie(ACCESS_COOKIE, s.access, { ...cookieBase, path: '/', maxAge: ACCESS_TTL_SEC });
    // refresh виден только auth-эндпоинтам — не уходит с каждым запросом к API
    if (s.refresh) {
      reply.setCookie(REFRESH_COOKIE, s.refresh, { ...cookieBase, path: '/api/auth', maxAge: REFRESH_TTL_MS / 1000 });
    }
  };
  const clearCookies = (reply: FastifyReply) => {
    reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  };

  const errors = { 401: apiErrorSchema, 409: apiErrorSchema, 429: apiErrorSchema };
  const limit = { config: { rateLimit: { max: config.authRateLimitMax, timeWindow: '15 minutes' } } };

  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof AuthError) return reply.code(e.status as 401 | 409 | 429).send({ error: e.message });
    throw e;
  };

  r.post(
    '/api/auth/register',
    { ...limit, schema: { body: credentialsSchema, response: { 200: meSchema, ...errors } } },
    async (req, reply) => {
      const { username, password, accessPassword } = req.body;
      if (!safeEqual(accessPassword, config.accessPassword)) {
        return reply.code(401).send({ error: 'invalid access password' });
      }
      try {
        const row = await register(db, username, password);
        setCookies(reply, await startSession(db, secret, row, req.headers['user-agent']));
        hub.emit({ type: 'users', by: row.id });
        return toAuthUser(row);
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  r.post(
    '/api/auth/login',
    { ...limit, schema: { body: loginSchema, response: { 200: meSchema, ...errors } } },
    async (req, reply) => {
      const { username, password } = req.body;
      const key = `${req.ip}|${username.toLowerCase()}`;
      const wait = throttle.retryAfter(key);
      if (wait) {
        reply.header('retry-after', wait);
        return reply.code(429).send({ error: 'too many attempts, try again later' });
      }
      try {
        const row = await verifyLogin(db, username, password);
        throttle.reset(key);
        setCookies(reply, await startSession(db, secret, row, req.headers['user-agent']));
        return toAuthUser(row);
      } catch (e) {
        if (e instanceof AuthError && e.status === 401) throttle.fail(key);
        return fail(reply, e);
      }
    },
  );

  // обмен refresh-cookie на новую пару; вызывается клиентом при 401
  r.post(
    '/api/auth/refresh',
    { ...limit, schema: { response: { 200: meSchema, 401: apiErrorSchema, 429: apiErrorSchema } } },
    async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) return reply.code(401).send({ error: 'not authenticated' });
      try {
        const s = await refreshSession(db, secret, token, req.headers['user-agent']);
        setCookies(reply, s);
        return s.user;
      } catch (e) {
        clearCookies(reply);
        return fail(reply, e);
      }
    },
  );

  r.post('/api/auth/logout', async (req: FastifyRequest, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) await endSession(db, token);
    clearCookies(reply);
    return reply.code(204).send();
  });

  // выйти на всех устройствах
  r.post('/api/auth/logout-all', { preHandler: requireUser(db) }, async (req, reply) => {
    await endAllSessions(db, req.user.id);
    clearCookies(reply);
    return reply.code(204).send();
  });

  r.get(
    '/api/auth/me',
    { preHandler: requireUser(db), schema: { response: { 200: meSchema, 401: apiErrorSchema } } },
    async (req) => req.user,
  );
}
