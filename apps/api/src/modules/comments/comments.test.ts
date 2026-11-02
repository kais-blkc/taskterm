import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';

describe('comments', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let alice: string;
  let bob: string;
  let taskId: number;

  const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });
  const register = async (username: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password: 'secret123', accessPassword: 'gate' },
    });
    return `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
  };

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), { logger: false });
    await app.ready();
    alice = await register('alice');
    bob = await register('bob');
    const board = (await call(alice, 'POST', '/api/boards', { name: 'B' })).json();
    const bobId = (await call(alice, 'GET', '/api/users')).json().find((u: any) => u.username === 'bob').id;
    await call(alice, 'PUT', `/api/boards/${board.id}/members/${bobId}`, { role: 'editor' });
    const full = (await call(alice, 'GET', `/api/boards/${board.id}`)).json();
    const t = await call(alice, 'POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 't' });
    taskId = t.json().id;
  });
  afterEach(() => app.close());

  it('creates and lists comments with author names, in order', async () => {
    await call(alice, 'POST', `/api/tasks/${taskId}/comments`, { body: 'first' });
    await call(bob, 'POST', `/api/tasks/${taskId}/comments`, { body: 'second' });
    const list = (await call(alice, 'GET', `/api/tasks/${taskId}/comments`)).json();
    expect(list.map((c: any) => [c.authorName, c.body])).toEqual([
      ['alice', 'first'],
      ['bob', 'second'],
    ]);
  });

  it('only author can edit/delete', async () => {
    const c = (await call(alice, 'POST', `/api/tasks/${taskId}/comments`, { body: 'mine' })).json();
    expect((await call(bob, 'PATCH', `/api/comments/${c.id}`, { body: 'hack' })).statusCode).toBe(403);
    expect((await call(bob, 'DELETE', `/api/comments/${c.id}`)).statusCode).toBe(403);

    const upd = await call(alice, 'PATCH', `/api/comments/${c.id}`, { body: 'edited' });
    expect(upd.json()).toMatchObject({ body: 'edited' });
    expect(upd.json().editedAt).toBeTruthy();
    expect((await call(alice, 'DELETE', `/api/comments/${c.id}`)).statusCode).toBe(204);
    expect((await call(alice, 'GET', `/api/tasks/${taskId}/comments`)).json()).toHaveLength(0);
  });

  it('404 for missing task, 400 for empty body, comments die with task', async () => {
    expect((await call(alice, 'GET', '/api/tasks/9999/comments')).statusCode).toBe(404);
    expect((await call(alice, 'POST', `/api/tasks/${taskId}/comments`, { body: '  ' })).statusCode).toBe(400);
    await call(alice, 'POST', `/api/tasks/${taskId}/comments`, { body: 'x' });
    await call(alice, 'DELETE', `/api/tasks/${taskId}`);
    expect((await call(alice, 'GET', `/api/tasks/${taskId}/comments`)).statusCode).toBe(404);
  });
});
