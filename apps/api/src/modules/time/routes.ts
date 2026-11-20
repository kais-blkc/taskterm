import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createEntrySchema,
  duePayoutSchema,
  idParamSchema,
  liveTimerSchema,
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
import { errors } from '../../http';
import type { EventHub } from '../../plugins/hub';
import { requireAdmin, requireUser } from '../auth/guard';
import { createTimeService } from './service';

/**
 * Таймер работы: свой таймер/записи у каждого пользователя, отчёты и ставка — у админа.
 * Роуты тонкие; ошибки сервиса (TimeError, NotFound, Forbidden со `status`) отдаёт общий обработчик.
 */
export async function timeRoutes(app: FastifyInstance, opts: { db: Db; hub: EventHub; config: Config }) {
  const { db, hub, config } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const svc = createTimeService(db, config.timeZone);
  const err = errors(400, 401, 403, 404, 409);
  const user = requireUser(db);
  const admin = requireAdmin(db);
  const state = { 200: timerStateSchema, ...err };

  r.get('/api/time/settings', { preHandler: user, schema: { response: { 200: timerSettingsSchema, ...err } } }, () => svc.settings());

  r.get('/api/time/state', { preHandler: user, schema: { response: { 200: timerStateSchema, ...err } } }, (req) => svc.state(req.user));

  r.post(
    '/api/time/start',
    { preHandler: user, schema: { body: startTimerSchema, response: state } },
    async (req) => {
      const { state, events } = await svc.start(req.user, req.body);
      hub.emitAll(events);
      return state;
    },
  );

  r.post('/api/time/pause', { preHandler: user, schema: { response: state } }, async (req) => {
    const { state, events } = await svc.pause(req.user);
    hub.emitAll(events);
    return state;
  });

  r.post('/api/time/resume', { preHandler: user, schema: { response: state } }, async (req) => {
    const { state, events } = await svc.resume(req.user);
    hub.emitAll(events);
    return state;
  });

  r.post(
    '/api/time/stop',
    { preHandler: user, schema: { body: stopTimerSchema.nullish(), response: state } },
    async (req) => {
      const { state, events } = await svc.stop(req.user, req.body?.endedAt);
      hub.emitAll(events);
      return state;
    },
  );

  r.get(
    '/api/time/entries',
    { preHandler: user, schema: { querystring: periodQuerySchema, response: { 200: myEntriesSchema, ...err } } },
    (req) => svc.entries(req.user, req.query.from, req.query.to),
  );

  r.post(
    '/api/time/entries',
    { preHandler: user, schema: { body: createEntrySchema, response: { 200: timeEntrySchema, ...err } } },
    async (req) => {
      const { entry, events } = await svc.createEntry(req.user, req.body);
      hub.emitAll(events);
      return entry;
    },
  );

  r.patch(
    '/api/time/entries/:id',
    { preHandler: user, schema: { params: idParamSchema, body: updateEntrySchema, response: { 200: timeEntrySchema, ...err } } },
    async (req) => {
      const { entry, events } = await svc.updateEntry(req.user, req.params.id, req.body);
      hub.emitAll(events);
      return entry;
    },
  );

  r.delete(
    '/api/time/entries/:id',
    { preHandler: user, schema: { params: idParamSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      hub.emitAll((await svc.deleteEntry(req.user, req.params.id)).events);
      return reply.code(204).send(null);
    },
  );

  // ---- админ ----

  r.put(
    '/api/admin/time/settings',
    { preHandler: admin, schema: { body: updateTimerSettingsSchema, response: { 200: timerSettingsSchema, ...err } } },
    async (req) => {
      const { settings, events } = await svc.saveSettings(req.user, req.body);
      hub.emitAll(events);
      return settings;
    },
  );

  r.get('/api/admin/time/live', { preHandler: admin, schema: { response: { 200: z.array(liveTimerSchema), ...err } } }, (req) => svc.live(req.user));

  r.get(
    '/api/admin/time/report',
    { preHandler: admin, schema: { querystring: reportQuerySchema, response: { 200: timeReportSchema, ...err } } },
    (req) => svc.report(req.user, req.query.from, req.query.to, req.query.userId),
  );

  r.get('/api/admin/time/report.csv', { preHandler: admin, schema: { querystring: reportQuerySchema } }, async (req, reply) => {
    const { from, to, userId, view } = req.query;
    const csv = await svc.reportCsv(req.user, from, to, userId, view);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="time-${view === 'projects' ? 'projects-' : ''}${from}_${to}.csv"`)
      .send(csv);
  });

  // ---- выплаты ----

  r.get(
    '/api/admin/time/payouts',
    { preHandler: admin, schema: { querystring: payoutsQuerySchema, response: { 200: z.array(payoutSchema), ...err } } },
    (req) => svc.listPayouts(req.user, { userId: req.query.userId, limit: req.query.limit }),
  );

  r.get(
    '/api/admin/time/payouts/due',
    { preHandler: admin, schema: { response: { 200: z.array(duePayoutSchema), ...err } } },
    (req) => svc.duePayouts(req.user),
  );

  r.post(
    '/api/admin/time/payouts',
    { preHandler: admin, schema: { body: markPaidSchema, response: { 201: payoutSchema, ...err } } },
    async (req, reply) => {
      const { payout, events } = await svc.markPaid(req.user, req.body);
      hub.emitAll(events);
      return reply.code(201).send(payout);
    },
  );

  r.delete(
    '/api/admin/time/payouts/:id',
    { preHandler: admin, schema: { params: idParamSchema, response: { 204: z.null(), ...err } } },
    async (req, reply) => {
      hub.emitAll((await svc.unmarkPaid(req.user, req.params.id)).events);
      return reply.code(204).send(null);
    },
  );
}
