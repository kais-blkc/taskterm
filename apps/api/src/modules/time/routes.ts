import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  createEntrySchema,
  idParamSchema,
  liveTimerSchema,
  duePayoutSchema,
  markPaidSchema,
  myEntriesSchema,
  payoutSchema,
  payoutsQuerySchema,
  periodQuerySchema,
  reportQuerySchema,
  startTimerSchema,
  stopTimerSchema,
  timeEntrySchema,
  timeReportSchema,
  timerSettingsSchema,
  timerStateSchema,
  updateEntrySchema,
  updateTimerSettingsSchema,
} from '@taskterm/shared';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import type { EventHub } from '../../plugins/hub';
import { audit } from '../audit/service';
import { requireAdmin, requireUser } from '../auth/guard';
import { ForbiddenError, NotFoundError } from '../permissions/access';
import * as svc from './service';

/** Таймер работы: свой таймер/записи у каждого пользователя, отчёты и ставка — у админа */
export async function timeRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; config: Config }) {
  const { db, hub, config } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const err = { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };
  const user = requireUser(db);
  const admin = requireAdmin(db);
  const settings = () => svc.getSettings(db, config.timeZone);

  const guard = (reply: FastifyReply, e: unknown) => {
    if (e instanceof svc.TimeError) return reply.code(e.status).send({ error: e.message });
    if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
    if (e instanceof ForbiddenError) return reply.code(403).send({ error: e.message });
    throw e;
  };

  r.get('/api/time/settings', { preHandler: user, schema: { response: { 200: timerSettingsSchema, ...err } } }, settings);

  r.get('/api/time/state', { preHandler: user, schema: { response: { 200: timerStateSchema, ...err } } }, async (req) =>
    svc.getState(db, req.user.id),
  );

  const act = <T>(fn: (uid: number) => Promise<T>) => async (req: { user: { id: number } }, reply: FastifyReply) => {
    try {
      const out = await fn(req.user.id);
      hub.emit({ type: 'time', by: req.user.id });
      return out;
    } catch (e) {
      return guard(reply, e);
    }
  };

  r.post(
    '/api/time/start',
    { preHandler: user, schema: { body: startTimerSchema, response: { 200: timerStateSchema, ...err } } },
    async (req, reply) => {
      try {
        const out = await svc.startTimer(db, req.user, req.body);
        hub.emit({ type: 'time', by: req.user.id });
        return out;
      } catch (e) {
        return guard(reply, e);
      }
    },
  );
  r.post('/api/time/pause', { preHandler: user, schema: { response: { 200: timerStateSchema, ...err } } }, (req, reply) =>
    act((id) => svc.pauseTimer(db, id))(req, reply),
  );
  r.post('/api/time/resume', { preHandler: user, schema: { response: { 200: timerStateSchema, ...err } } }, (req, reply) =>
    act((id) => svc.resumeTimer(db, id))(req, reply),
  );
  r.post(
    '/api/time/stop',
    { preHandler: user, schema: { body: stopTimerSchema.nullish(), response: { 200: timerStateSchema, ...err } } },
    (req, reply) => act((id) => svc.stopTimer(db, id, req.body?.endedAt))(req, reply),
  );

  r.get(
    '/api/time/entries',
    { preHandler: user, schema: { querystring: periodQuerySchema, response: { 200: myEntriesSchema, ...err } } },
    async (req, reply) => {
      try {
        return await svc.myEntries(db, req.user.id, req.query.from, req.query.to, await settings());
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.post(
    '/api/time/entries',
    { preHandler: user, schema: { body: createEntrySchema, response: { 200: timeEntrySchema, ...err } } },
    async (req, reply) => {
      try {
        const entry = await svc.createEntry(db, req.user, req.body);
        await audit(db, req.user, 'time.add', `entry:${entry.id}`, { startedAt: entry.startedAt, endedAt: entry.endedAt, note: entry.note });
        hub.emit({ type: 'time', by: req.user.id });
        return entry;
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.patch(
    '/api/time/entries/:id',
    { preHandler: user, schema: { params: idParamSchema, body: updateEntrySchema, response: { 200: timeEntrySchema, ...err } } },
    async (req, reply) => {
      try {
        const { entry, before } = await svc.updateEntry(db, req.user, req.params.id, req.body);
        await audit(db, req.user, 'time.edit', `entry:${entry.id}`, {
          before: { startedAt: before.startedAt, endedAt: before.endedAt, note: before.note, taskId: before.taskId },
          after: { startedAt: entry.startedAt, endedAt: entry.endedAt, note: entry.note, taskId: entry.taskId },
        });
        hub.emit({ type: 'time', by: req.user.id });
        return entry;
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.delete(
    '/api/time/entries/:id',
    { preHandler: user, schema: { params: idParamSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      try {
        const before = await svc.deleteEntry(db, req.user.id, req.params.id);
        await audit(db, req.user, 'time.delete', `entry:${before.id}`, { startedAt: before.startedAt, endedAt: before.endedAt, note: before.note });
        hub.emit({ type: 'time', by: req.user.id });
        return reply.code(204).send(null);
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  // ---- админ ----

  r.put(
    '/api/admin/time/settings',
    { preHandler: admin, schema: { body: updateTimerSettingsSchema, response: { 200: timerSettingsSchema, ...err } } },
    async (req) => {
      const out = await svc.saveSettings(db, req.body, config.timeZone);
      await audit(db, req.user, 'time.settings', '', { hourlyRate: out.hourlyRate, currency: out.currency });
      hub.emit({ type: 'time', by: req.user.id });
      return out;
    },
  );

  r.get('/api/admin/time/live', { preHandler: admin, schema: { response: { 200: z.array(liveTimerSchema), ...err } } }, () =>
    svc.liveTimers(db),
  );

  r.get(
    '/api/admin/time/report',
    { preHandler: admin, schema: { querystring: reportQuerySchema, response: { 200: timeReportSchema, ...err } } },
    async (req, reply) => {
      try {
        return await svc.buildReport(db, req.query.from, req.query.to, await settings(), req.query.userId);
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  // ---- выплаты ----

  r.get(
    '/api/admin/time/payouts',
    { preHandler: admin, schema: { querystring: payoutsQuerySchema, response: { 200: z.array(payoutSchema), ...err } } },
    (req) => svc.listPayouts(db, { userId: req.query.userId, limit: req.query.limit }),
  );

  r.get(
    '/api/admin/time/payouts/due',
    { preHandler: admin, schema: { response: { 200: z.array(duePayoutSchema), ...err } } },
    async (_req, reply) => {
      try {
        return await svc.duePayouts(db, await settings());
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.post(
    '/api/admin/time/payouts',
    { preHandler: admin, schema: { body: markPaidSchema, response: { 201: payoutSchema, ...err } } },
    async (req, reply) => {
      try {
        const p = await svc.markPaid(db, req.user, req.body, await settings());
        await audit(db, req.user, 'time.payout', `user:${p.userId}`, { from: p.from, to: p.to, ms: p.ms, amount: p.amount, currency: p.currency });
        hub.emit({ type: 'time', by: req.user.id });
        return reply.code(201).send(p);
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.delete(
    '/api/admin/time/payouts/:id',
    { preHandler: admin, schema: { params: idParamSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      try {
        const p = await svc.unmarkPaid(db, req.params.id);
        await audit(db, req.user, 'time.payout.undo', `user:${p.userId}`, { from: p.from, to: p.to, ms: p.ms, amount: p.amount, currency: p.currency });
        hub.emit({ type: 'time', by: req.user.id });
        return reply.code(204).send(null);
      } catch (e) {
        return guard(reply, e);
      }
    },
  );

  r.get('/api/admin/time/report.csv', { preHandler: admin, schema: { querystring: reportQuerySchema } }, async (req, reply) => {
    try {
      const report = await svc.buildReport(db, req.query.from, req.query.to, await settings(), req.query.userId);
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="time-${req.query.view === 'projects' ? 'projects-' : ''}${req.query.from}_${req.query.to}.csv"`)
        .send(svc.reportToCsv(report, req.query.view));
    } catch (e) {
      return guard(reply, e);
    }
  });
}
