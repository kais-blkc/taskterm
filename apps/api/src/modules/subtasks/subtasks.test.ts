import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';

describe('subtasks', () => {
  let app: ReturnType<typeof buildApp>;
  let cookie: string;
  let boardId: number;
  let taskId: number;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });
  const stats = async () => (await call('GET', `/api/boards/${boardId}`)).json().subtaskStats;

  beforeEach(async () => {
    app = buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), { logger: false });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: 'secret123', accessPassword: 'gate' },
    });
    cookie = `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
    boardId = (await call('POST', '/api/boards', { name: 'B' })).json().id;
    const full = (await call('GET', `/api/boards/${boardId}`)).json();
    taskId = (await call('POST', `/api/boards/${boardId}/tasks`, { columnId: full.columns[0].id, title: 'T' })).json().id;
  });
  afterEach(() => app.close());

  it('creates, lists in order, toggles, renames, deletes', async () => {
    const a = (await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'first' })).json();
    await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'second' });
    expect(a).toMatchObject({ title: 'first', done: false, taskId });

    expect((await call('PATCH', `/api/subtasks/${a.id}`, { done: true })).json().done).toBe(true);
    expect((await call('PATCH', `/api/subtasks/${a.id}`, { title: 'renamed' })).json()).toMatchObject({
      title: 'renamed',
      done: true, // переименование не сбрасывает галочку
    });

    const list = (await call('GET', `/api/tasks/${taskId}/subtasks`)).json();
    expect(list.map((s: any) => [s.title, s.done])).toEqual([
      ['renamed', true],
      ['second', false],
    ]);

    expect((await call('DELETE', `/api/subtasks/${a.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/tasks/${taskId}/subtasks`)).json()).toHaveLength(1);
  });

  it('board payload carries per-task counters', async () => {
    expect(await stats()).toEqual([]);
    const a = (await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'a' })).json();
    await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'b' });
    await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'c' });
    await call('PATCH', `/api/subtasks/${a.id}`, { done: true });
    expect(await stats()).toEqual([{ taskId, total: 3, done: 1 }]);
  });

  it('bulk-creates parsed items in order, with done flags', async () => {
    const res = await call('POST', `/api/tasks/${taskId}/subtasks/bulk`, {
      items: [
        { title: 'один' },
        { title: 'два', done: true },
        { title: 'три', done: false },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().map((s: any) => [s.title, s.done])).toEqual([
      ['один', false],
      ['два', true],
      ['три', false],
    ]);
    expect(await stats()).toEqual([{ taskId, total: 3, done: 1 }]);
    const list = (await call('GET', `/api/tasks/${taskId}/subtasks`)).json();
    expect(list.map((s: any) => s.title)).toEqual(['один', 'два', 'три']);
  });

  it('bulk rejects empty, oversized and invalid payloads atomically', async () => {
    const url = `/api/tasks/${taskId}/subtasks/bulk`;
    expect((await call('POST', url, { items: [] })).statusCode).toBe(400);
    expect((await call('POST', url, { items: [{ title: ' ' }] })).statusCode).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ title: `п${i}` }));
    expect((await call('POST', url, { items: tooMany })).statusCode).toBe(400);
    expect((await call('POST', '/api/tasks/9999/subtasks/bulk', { items: [{ title: 'x' }] })).statusCode).toBe(404);
    expect(await stats()).toEqual([]);
  });

  it('subtasks are removed with their task', async () => {
    await call('POST', `/api/tasks/${taskId}/subtasks`, { title: 'a' });
    await call('DELETE', `/api/tasks/${taskId}`);
    expect(await stats()).toEqual([]);
    expect((await call('GET', `/api/tasks/${taskId}/subtasks`)).statusCode).toBe(404);
  });

  it('validates input and handles missing ids', async () => {
    expect((await call('POST', `/api/tasks/${taskId}/subtasks`, { title: '  ' })).statusCode).toBe(400);
    expect((await call('POST', '/api/tasks/9999/subtasks', { title: 'x' })).statusCode).toBe(404);
    expect((await call('PATCH', '/api/subtasks/9999', { done: true })).statusCode).toBe(404);
    expect((await call('DELETE', '/api/subtasks/9999')).statusCode).toBe(404);
    const unauth = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}/subtasks` });
    expect(unauth.statusCode).toBe(401);
  });
});
