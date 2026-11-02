import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../../db/client';
import { authenticate, type AuthUser } from './service';

export const ACCESS_COOKIE = 'tt_access';
export const REFRESH_COOKIE = 'tt_refresh';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
  interface FastifyInstance {
    jwtSecret: string;
    /** то же подключение, что получают модули; нужно тестам и служебному коду */
    db: Db;
  }
}

export function requireUser(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[ACCESS_COOKIE];
    const user = token ? await authenticate(db, req.server.jwtSecret, token) : null;
    if (!user) return reply.code(401).send({ error: 'not authenticated' });
    req.user = user;
  };
}

export function requireAdmin(db: Db) {
  const base = requireUser(db);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const denied = await base(req, reply);
    if (denied) return denied;
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
  };
}
