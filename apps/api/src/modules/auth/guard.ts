import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAdminRole, isStaffRole } from '@taskterm/shared';
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
    if (!user) return reply.code(401).send({ error: 'не выполнен вход' });
    req.user = user;
  };
}

/** owner и admin: время, ставки, роли, журнал, настройки */
export function requireAdmin(db: Db) {
  const base = requireUser(db);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const denied = await base(req, reply);
    if (denied) return denied;
    if (!isAdminRole(req.user.role)) return reply.code(403).send({ error: 'только для администраторов' });
  };
}

/** owner, admin и moderator: админ-панель (пользователи, приглашения, доски) */
export function requireStaff(db: Db) {
  const base = requireUser(db);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const denied = await base(req, reply);
    if (denied) return denied;
    if (!isStaffRole(req.user.role)) return reply.code(403).send({ error: 'только для администрации' });
  };
}
