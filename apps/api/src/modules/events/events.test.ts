import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serverEventSchema, type ServerEvent } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('SSE events', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let base: string;

  const register = async (username: string) => {
    const res = await signupUser(app, username);
    return `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
  };
  const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  });
  afterEach(() => app.close());

  async function listen(cookie: string) {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { cookie }, signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const events: ServerEvent[] = [];
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += dec.decode(value);
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (chunk.startsWith('data: ')) events.push(serverEventSchema.parse(JSON.parse(chunk.slice(6))));
          }
        }
      } catch {
        /* aborted */
      }
    })();
    const waitFor = async (pred: (e: ServerEvent) => boolean) => {
      for (let i = 0; i < 50; i++) {
        const found = events.find(pred);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('event not received');
    };
    return { events, waitFor, stop: () => ctrl.abort() };
  }

  it('rejects unauthenticated stream', async () => {
    const res = await fetch(`${base}/api/events`);
    expect(res.status).toBe(401);
  });

  it('notifies the assignee only when someone else assigns them', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const bobId = (await call(bob, 'GET', '/api/users')).json().find((u: any) => u.username === 'bob').id;
    const aliceId = (await call(alice, 'GET', '/api/users')).json().find((u: any) => u.username === 'alice').id;
    const board = (await call(alice, 'POST', '/api/boards', { name: 'B' })).json();
    await call(alice, 'PUT', `/api/boards/${board.id}/members/${bobId}`, { role: 'editor' });
    const full = (await call(alice, 'GET', `/api/boards/${board.id}`)).json();
    const task = (
      await call(alice, 'POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 'T' })
    ).json();

    const stream = await listen(bob);
    // себя назначить — без уведомления
    await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, payload: { assigneeIds: [aliceId] }, headers: { cookie: alice } });
    await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, payload: { assigneeIds: [bobId] }, headers: { cookie: alice } });
    const n = await stream.waitFor((e) => e.type === 'notify');
    if (n.type !== 'notify') throw new Error('unreachable');
    expect(n.kind).toBe('assigned');
    expect(n.recipients).toEqual([bobId]);
    expect(n.authorName).toBe('alice');
    expect(stream.events.filter((e) => e.type === 'notify')).toHaveLength(1);
    stream.stop();
  });

  it('delivers board/comment events and notify recipients exclude the author', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const stream = await listen(bob);

    const bobId = (await call(alice, 'GET', '/api/users')).json().find((u: any) => u.username === 'bob').id;
    const board = (await call(alice, 'POST', '/api/boards', { name: 'B' })).json();
    await stream.waitFor((e) => e.type === 'boards');
    await call(alice, 'PUT', `/api/boards/${board.id}/members/${bobId}`, { role: 'editor' });

    const full = (await call(alice, 'GET', `/api/boards/${board.id}`)).json();
    const task = (
      await call(alice, 'POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 'T' })
    ).json();
    await stream.waitFor((e) => e.type === 'board' && e.boardId === board.id);

    // bob комментирует задачу alice -> alice должна получить notify, bob — нет
    await call(bob, 'POST', `/api/tasks/${task.id}/comments`, { body: 'hello alice' });
    const notify = await stream.waitFor((e) => e.type === 'notify');
    if (notify.type !== 'notify') throw new Error('unreachable');
    expect(notify.authorName).toBe('bob');
    expect(notify.taskNumber).toBe(1);
    expect(notify.recipients).toHaveLength(1);
    expect(notify.recipients).not.toContain(notify.by);
    await stream.waitFor((e) => e.type === 'comments' && e.taskId === task.id);
    stream.stop();
  });

  it('only board members receive that board\'s events (membership changes apply live)', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const bobId = (await call(alice, 'GET', '/api/users')).json().find((u: any) => u.username === 'bob').id;
    const board = (await call(alice, 'POST', '/api/boards', { name: 'B' })).json();
    const colId = (await call(alice, 'GET', `/api/boards/${board.id}`)).json().columns[0].id;
    const addTask = async (title: string) =>
      (await call(alice, 'POST', `/api/boards/${board.id}/tasks`, { columnId: colId, title })).json();
    const quiet = () => new Promise((r) => setTimeout(r, 150));
    const forBoard = (events: ServerEvent[]) =>
      events.filter((e) => 'boardId' in e && e.type !== 'members' && e.boardId === board.id);

    const stream = await listen(bob);
    const t1 = await addTask('hidden');
    await call(alice, 'POST', `/api/tasks/${t1.id}/comments`, { body: 'secret' });
    await call(alice, 'POST', `/api/tasks/${t1.id}/subtasks`, { title: 'secret too' });
    await quiet();
    expect(forBoard(stream.events)).toEqual([]); // посторонний ничего не видит

    await call(alice, 'PUT', `/api/boards/${board.id}/members/${bobId}`, { role: 'viewer' });
    await stream.waitFor((e) => e.type === 'members' && e.boardId === board.id);
    await addTask('visible');
    await stream.waitFor((e) => e.type === 'board' && e.boardId === board.id); // теперь события идут

    await call(alice, 'DELETE', `/api/boards/${board.id}/members/${bobId}`);
    await stream.waitFor((e) => e.type === 'members' && e.boardId === board.id && e !== stream.events.find((x) => x.type === 'members'));
    const before = forBoard(stream.events).length;
    await addTask('hidden again');
    await quiet();
    expect(forBoard(stream.events).length).toBe(before);
    stream.stop();
  });

  it('blocking a user closes their open stream', async () => {
    const admin = await signupUser(app, 'root', 'secret123', 'admin');
    const adminCookie = `${admin.cookies[0]!.name}=${admin.cookies[0]!.value}`;
    const bob = await signupUser(app, 'bobby');
    const bobCookie = `${bob.cookies[0]!.name}=${bob.cookies[0]!.value}`;
    const res = await fetch(`${base}/api/events`, { headers: { cookie: bobCookie } });
    const reader = res.body!.getReader();
    await reader.read(); // retry: 3000
    const closed = (async () => {
      for (;;) if ((await reader.read()).done) return true;
    })();
    await call(adminCookie, 'PATCH', `/api/admin/users/${bob.json().id}`, { isActive: false });
    expect(await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 2000))])).toBe(true);
  });
});
