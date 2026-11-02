import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';

describe('boards & tasks', () => {
  let app: ReturnType<typeof buildApp>;
  let cookie: string;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });

  beforeEach(async () => {
    app = buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), { logger: false });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: 'secret123', accessPassword: 'gate' },
    });
    cookie = `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
  });
  afterEach(() => app.close());

  const setup = async () => {
    const board = (await call('POST', '/api/boards', { name: 'Bugs' })).json();
    const full = (await call('GET', `/api/boards/${board.id}`)).json();
    return { board, cols: full.columns as { id: number; name: string }[] };
  };
  const addTask = async (boardId: number, columnId: number, title: string) =>
    (await call('POST', `/api/boards/${boardId}/tasks`, { columnId, title })).json();
  const titlesIn = async (boardId: number, columnId: number) => {
    const full = (await call('GET', `/api/boards/${boardId}`)).json();
    return full.tasks.filter((t: any) => t.columnId === columnId).map((t: any) => t.title);
  };

  it('requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/boards' });
    expect(res.statusCode).toBe(401);
  });

  it('creates board with 4 default columns in order', async () => {
    const { cols } = await setup();
    expect(cols.map((c) => c.name)).toEqual(['Новые', 'В работе', 'На проверке', 'Сделано']);
  });

  it('numbers tasks per board sequentially', async () => {
    const { board, cols } = await setup();
    const a = await addTask(board.id, cols[0]!.id, 'a');
    const b = await addTask(board.id, cols[1]!.id, 'b');
    expect([a.number, b.number]).toEqual([1, 2]);
  });

  it('adds columns at the end and cascades delete', async () => {
    const { board, cols } = await setup();
    const col = (await call('POST', `/api/boards/${board.id}/columns`, { name: 'Backlog' })).json();
    const full = (await call('GET', `/api/boards/${board.id}`)).json();
    expect(full.columns.at(-1).id).toBe(col.id);

    await addTask(board.id, col.id, 'x');
    expect((await call('DELETE', `/api/columns/${col.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/boards/${board.id}`)).json().tasks).toHaveLength(0);
    expect(cols).toHaveLength(4);
  });

  it('moves tasks: reorder inside column and across columns', async () => {
    const { board, cols } = await setup();
    const [c0, c1] = [cols[0]!.id, cols[1]!.id];
    const a = await addTask(board.id, c0, 'a');
    const b = await addTask(board.id, c0, 'b');
    const c = await addTask(board.id, c0, 'c');
    expect(await titlesIn(board.id, c0)).toEqual(['a', 'b', 'c']);

    // c -> перед a
    await call('POST', `/api/tasks/${c.id}/move`, { columnId: c0, beforeId: a.id });
    expect(await titlesIn(board.id, c0)).toEqual(['c', 'a', 'b']);

    // a -> в конец
    await call('POST', `/api/tasks/${a.id}/move`, { columnId: c0, beforeId: null });
    expect(await titlesIn(board.id, c0)).toEqual(['c', 'b', 'a']);

    // b -> в другую колонку, затем a перед b
    await call('POST', `/api/tasks/${b.id}/move`, { columnId: c1, beforeId: null });
    await call('POST', `/api/tasks/${a.id}/move`, { columnId: c1, beforeId: b.id });
    expect(await titlesIn(board.id, c0)).toEqual(['c']);
    expect(await titlesIn(board.id, c1)).toEqual(['a', 'b']);
  });

  it('many inserts at the same spot keep order', async () => {
    const { board, cols } = await setup();
    const c0 = cols[0]!.id;
    const first = await addTask(board.id, c0, 'first');
    const last = await addTask(board.id, c0, 'last');
    for (let i = 0; i < 20; i++) {
      const t = await addTask(board.id, c0, `n${i}`);
      await call('POST', `/api/tasks/${t.id}/move`, { columnId: c0, beforeId: last.id });
    }
    const titles = await titlesIn(board.id, c0);
    expect(titles[0]).toBe('first');
    expect(titles.at(-1)).toBe('last');
    expect(titles.slice(1, -1)).toEqual(Array.from({ length: 20 }, (_, i) => `n${i}`));
    expect(first.id).toBeTruthy();
  });

  it('rejects move to a column of another board', async () => {
    const { board, cols } = await setup();
    const other = await setup();
    const t = await addTask(board.id, cols[0]!.id, 't');
    const res = await call('POST', `/api/tasks/${t.id}/move`, { columnId: other.cols[0]!.id, beforeId: null });
    expect(res.statusCode).toBe(400);
  });

  it('updates and deletes task, 404 for missing', async () => {
    const { board, cols } = await setup();
    const t = await addTask(board.id, cols[0]!.id, 'old');
    const upd = await call('PATCH', `/api/tasks/${t.id}`, { title: 'new', description: '# md' });
    expect(upd.json()).toMatchObject({ title: 'new', description: '# md' });
    expect((await call('DELETE', `/api/tasks/${t.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/tasks/${t.id}`)).statusCode).toBe(404);
  });

  it('validates input', async () => {
    const res = await call('POST', '/api/boards', { name: '   ' });
    expect(res.statusCode).toBe(400);
  });
});

describe('assignees', () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(async () => {
    app = buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), { logger: false });
    await app.ready();
  });
  afterEach(() => app.close());

  const register = async (username: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username, password: 'secret123', accessPassword: 'gate' },
    });
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id as number };
  };

  it('lists users without hashes, assigns, unassigns, rejects unknown user', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
      app.inject({ method, url, payload, headers: { cookie: alice.cookie } });

    const list = (await call('GET', '/api/users')).json();
    expect(list.map((u: any) => u.username)).toEqual(['alice', 'bob']);
    expect(JSON.stringify(list)).not.toContain('hash');

    const board = (await call('POST', '/api/boards', { name: 'B' })).json();
    const full = (await call('GET', `/api/boards/${board.id}`)).json();
    const task = (await call('POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 't' })).json();
    expect(task.assigneeId).toBeNull();

    const assigned = await call('PATCH', `/api/tasks/${task.id}`, { assigneeId: bob.id });
    expect(assigned.json().assigneeId).toBe(bob.id);

    // обновление заголовка не сбрасывает исполнителя
    const renamed = await call('PATCH', `/api/tasks/${task.id}`, { title: 'new' });
    expect(renamed.json().assigneeId).toBe(bob.id);

    expect((await call('PATCH', `/api/tasks/${task.id}`, { assigneeId: 9999 })).statusCode).toBe(400);
    const cleared = await call('PATCH', `/api/tasks/${task.id}`, { assigneeId: null });
    expect(cleared.json().assigneeId).toBeNull();
  });
});

describe('deadlines', () => {
  let app: ReturnType<typeof buildApp>;
  let cookie: string;
  beforeEach(async () => {
    app = buildApp(loadConfig({ databaseUrl: ':memory:', accessPassword: 'gate' }), { logger: false });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: 'secret123', accessPassword: 'gate' },
    });
    cookie = `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
  });
  afterEach(() => app.close());

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie } });

  const mk = async (extra: object = {}) => {
    const board = (await call('POST', '/api/boards', { name: 'B' })).json();
    const full = (await call('GET', `/api/boards/${board.id}`)).json();
    return (await call('POST', `/api/boards/${board.id}/tasks`, { columnId: full.columns[0].id, title: 't', ...extra })).json();
  };

  it('has no deadline by default and accepts one on create', async () => {
    expect((await mk()).dueDate).toBeNull();
    expect((await mk({ dueDate: '2026-12-31' })).dueDate).toBe('2026-12-31');
  });

  it('sets, keeps on other edits, and clears a deadline', async () => {
    const t = await mk();
    expect((await call('PATCH', `/api/tasks/${t.id}`, { dueDate: '2027-02-28' })).json().dueDate).toBe('2027-02-28');
    expect((await call('PATCH', `/api/tasks/${t.id}`, { title: 'renamed' })).json().dueDate).toBe('2027-02-28');
    expect((await call('PATCH', `/api/tasks/${t.id}`, { dueDate: null })).json().dueDate).toBeNull();
  });

  it('rejects malformed and non-existent dates', async () => {
    const t = await mk();
    for (const bad of ['31.12.2026', '2026-13-01', '2026-02-30', '2027-02-29', 'tomorrow', '']) {
      expect((await call('PATCH', `/api/tasks/${t.id}`, { dueDate: bad })).statusCode, bad).toBe(400);
    }
    // високосный год — валидная дата
    expect((await call('PATCH', `/api/tasks/${t.id}`, { dueDate: '2028-02-29' })).statusCode).toBe(200);
  });
});
