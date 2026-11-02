import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { userByToken } from './service';

export const SESSION_COOKIE = 'tt_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

export function requireUser(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await userByToken(db, token) : null;
    if (!user) return reply.code(401).send({ error: 'not authenticated' });
    req.user = user;
  };
}
