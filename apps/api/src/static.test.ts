import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';

describe('static SPA serving', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>spa</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', staticDir: dir }), { logger: false });
    await app.ready();
  });
  afterEach(() => app.close());

  it('serves index and assets', async () => {
    expect((await app.inject('/')).body).toContain('<title>spa</title>');
    expect((await app.inject('/app.js')).statusCode).toBe(200);
  });

  it('falls back to index.html for client routes', async () => {
    const res = await app.inject('/b/1/t/2');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>spa</title>');
  });

  it('keeps JSON 404 for unknown api paths and still serves api', async () => {
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'не найдено' });
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });
});
