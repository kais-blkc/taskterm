import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOARD_ROLES, canDeleteTask, roleCan, type BoardAction, type BoardRole } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('role matrix (shared)', () => {
  const rows: [BoardAction, BoardRole[]][] = [
    ['view', ['owner', 'editor', 'commenter', 'viewer']],
    ['comment', ['owner', 'editor', 'commenter']],
    ['createTask', ['owner', 'editor']],
    ['editTask', ['owner', 'editor']],
    ['deleteOwnTask', ['owner', 'editor']],
    ['deleteAnyTask', ['owner']],
    ['deleteAnyComment', ['owner']],
    ['manageBoard', ['owner']],
  ];
  for (const [action, allowed] of rows) {
    it(`${action}: ${allowed.join(', ')}`, () => {
      for (const role of BOARD_ROLES) expect(roleCan(role, action), `${role}.${action}`).toBe(allowed.includes(role));
      expect(roleCan(null, action)).toBe(false);
    });
  }
  it('canDeleteTask: editor only own, owner any', () => {
    expect(canDeleteTask('editor', true)).toBe(true);
    expect(canDeleteTask('editor', false)).toBe(false);
    expect(canDeleteTask('owner', false)).toBe(true);
    expect(canDeleteTask('commenter', true)).toBe(false);
    expect(canDeleteTask(null, true)).toBe(false);
  });
});

describe('board roles (API)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let owner: U, editor: U, commenter: U, viewer: U, outsider: U, admin: U;
  let boardId: number;
  let colId: number;
  let taskId: number; // создана владельцем

  const call = (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const register = async (username: string): Promise<U> => {
    const res = await signupUser(app, username);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const addTask = async (u: U, title: string) =>
    (await call(u, 'POST', `/api/boards/${boardId}/tasks`, { columnId: colId, title })).json();

  beforeEach(async () => {
    app = await buildApp(
      loadConfig({ databaseUrl: ':memory:', adminUsername: 'root', adminPassword: 'rootpass1' }),
      { logger: false },
    );
    await app.ready();
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'rootpass1' } });
    admin = { cookie: `${login.cookies[0]!.name}=${login.cookies[0]!.value}`, id: login.json().id };
    owner = await register('owner');
    editor = await register('editor');
    commenter = await register('commenter');
    viewer = await register('viewer');
    outsider = await register('outsider');
    boardId = (await call(owner, 'POST', '/api/boards', { name: 'B' })).json().id;
    for (const [u, role] of [[editor, 'editor'], [commenter, 'commenter'], [viewer, 'viewer']] as const) {
      expect((await call(owner, 'PUT', `/api/boards/${boardId}/members/${u.id}`, { role })).statusCode).toBe(200);
    }
    colId = (await call(owner, 'GET', `/api/boards/${boardId}`)).json().columns[0].id;
    taskId = (await addTask(owner, 'owner task')).id;
  });
  afterEach(() => app.close());

  it('creator becomes owner; list and board show myRole', async () => {
    const list = (await call(owner, 'GET', '/api/boards')).json();
    expect(list).toEqual([expect.objectContaining({ id: boardId, myRole: 'owner' })]);
    expect((await call(viewer, 'GET', `/api/boards/${boardId}`)).json().board.myRole).toBe('viewer');
  });

  it('outsider gets 404 everywhere and an empty list (existence is not leaked)', async () => {
    expect((await call(outsider, 'GET', '/api/boards')).json()).toEqual([]);
    const sub = (await call(owner, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 's' })).json();
    const cm = (await call(owner, 'POST', `/api/tasks/${taskId}/comments`, { body: 'c' })).json();
    const col = `/api/columns/${colId}`;
    const checks: ['GET' | 'POST' | 'PATCH' | 'DELETE', string, string, object?][] = [
      ['GET', `/api/boards/${boardId}`, 'board'],
      ['PATCH', `/api/boards/${boardId}`, 'rename', { name: 'x' }],
      ['DELETE', `/api/boards/${boardId}`, 'delete board'],
      ['GET', `/api/boards/${boardId}/members`, 'members'],
      ['POST', `/api/boards/${boardId}/tasks`, 'create task', { columnId: colId, title: 't' }],
      ['GET', `/api/tasks/${taskId}`, 'task'],
      ['PATCH', `/api/tasks/${taskId}`, 'edit task', { title: 'x' }],
      ['DELETE', `/api/tasks/${taskId}`, 'delete task'],
      ['POST', `/api/tasks/${taskId}/move`, 'move', { columnId: colId, beforeId: null }],
      ['GET', `/api/tasks/${taskId}/comments`, 'comments'],
      ['POST', `/api/tasks/${taskId}/comments`, 'comment', { body: 'x' }],
      ['PATCH', `/api/comments/${cm.id}`, 'edit comment', { body: 'x' }],
      ['DELETE', `/api/comments/${cm.id}`, 'delete comment'],
      ['GET', `/api/tasks/${taskId}/subtasks`, 'subtasks'],
      ['POST', `/api/tasks/${taskId}/subtasks`, 'add subtask', { title: 'x' }],
      ['POST', `/api/tasks/${taskId}/subtasks/bulk`, 'bulk', { items: [{ title: 'x' }] }],
      ['PATCH', `/api/subtasks/${sub.id}`, 'edit subtask', { done: true }],
      ['DELETE', `/api/subtasks/${sub.id}`, 'delete subtask'],
      ['PATCH', col, 'rename column', { name: 'x' }],
      ['DELETE', col, 'delete column'],
      ['POST', `/api/boards/${boardId}/columns`, 'add column', { name: 'x' }],
    ];
    for (const [method, url, what, body] of checks) {
      expect((await call(outsider, method, url, body)).statusCode, what).toBe(404);
    }
  });

  it('viewer: read-only', async () => {
    expect((await call(viewer, 'GET', `/api/tasks/${taskId}`)).statusCode).toBe(200);
    expect((await call(viewer, 'GET', `/api/tasks/${taskId}/comments`)).statusCode).toBe(200);
    expect((await call(viewer, 'GET', `/api/tasks/${taskId}/subtasks`)).statusCode).toBe(200);
    expect((await call(viewer, 'GET', `/api/boards/${boardId}/members`)).statusCode).toBe(200);
    const denied: ['POST' | 'PATCH' | 'DELETE', string, object?][] = [
      ['POST', `/api/boards/${boardId}/tasks`, { columnId: colId, title: 't' }],
      ['PATCH', `/api/tasks/${taskId}`, { title: 'x' }],
      ['POST', `/api/tasks/${taskId}/move`, { columnId: colId, beforeId: null }],
      ['DELETE', `/api/tasks/${taskId}`],
      ['POST', `/api/tasks/${taskId}/comments`, { body: 'x' }],
      ['POST', `/api/tasks/${taskId}/subtasks`, { title: 'x' }],
    ];
    for (const [m, url, body] of denied) {
      expect((await call(viewer, m, url, body)).statusCode, `${m} ${url}`).toBe(403);
    }
  });

  it('commenter: can comment (edit/delete own) but not touch tasks', async () => {
    const c = await call(commenter, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' });
    expect(c.statusCode).toBe(201);
    const id = c.json().id;
    expect((await call(commenter, 'PATCH', `/api/comments/${id}`, { body: 'hi2' })).statusCode).toBe(200);
    expect((await call(commenter, 'DELETE', `/api/comments/${id}`)).statusCode).toBe(204);
    expect((await call(commenter, 'PATCH', `/api/tasks/${taskId}`, { title: 'x' })).statusCode).toBe(403);
    expect((await call(commenter, 'POST', `/api/boards/${boardId}/tasks`, { columnId: colId, title: 'x' })).statusCode).toBe(403);
  });

  it('demoted to viewer: cannot edit their own old comment any more', async () => {
    const c = (await call(commenter, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' })).json();
    await call(owner, 'PUT', `/api/boards/${boardId}/members/${commenter.id}`, { role: 'viewer' });
    expect((await call(commenter, 'PATCH', `/api/comments/${c.id}`, { body: 'again' })).statusCode).toBe(403);
  });

  it('editor: works with tasks/subtasks, deletes only own tasks, cannot manage the board', async () => {
    const mine = await addTask(editor, 'mine');
    // своя задача: правит, переносит, работает с подзадачами
    expect((await call(editor, 'PATCH', `/api/tasks/${mine.id}`, { title: 'renamed by editor' })).statusCode).toBe(200);
    expect((await call(editor, 'POST', `/api/tasks/${mine.id}/move`, { columnId: colId, beforeId: null })).statusCode).toBe(200);
    const sub = await call(editor, 'POST', `/api/tasks/${mine.id}/subtasks`, { title: 's' });
    expect(sub.statusCode).toBe(201);
    expect((await call(editor, 'PATCH', `/api/subtasks/${sub.json().id}`, { done: true })).statusCode).toBe(200);
    expect((await call(editor, 'DELETE', `/api/subtasks/${sub.json().id}`)).statusCode).toBe(204);
    // чужая задача (не автор и не ответственный): только смотреть и комментировать
    expect((await call(editor, 'PATCH', `/api/tasks/${taskId}`, { title: 'hijack' })).statusCode).toBe(403);
    expect((await call(editor, 'POST', `/api/tasks/${taskId}/move`, { columnId: colId, beforeId: null })).statusCode).toBe(403);
    expect((await call(editor, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 's' })).statusCode).toBe(403);

    expect((await call(editor, 'DELETE', `/api/tasks/${taskId}`)).statusCode).toBe(403); // чужая
    expect((await call(editor, 'DELETE', `/api/tasks/${mine.id}`)).statusCode).toBe(204); // своя

    expect((await call(editor, 'PATCH', `/api/boards/${boardId}`, { name: 'x' })).statusCode).toBe(403);
    expect((await call(editor, 'DELETE', `/api/boards/${boardId}`)).statusCode).toBe(403);
    expect((await call(editor, 'POST', `/api/boards/${boardId}/columns`, { name: 'x' })).statusCode).toBe(403);
    expect((await call(editor, 'PATCH', `/api/columns/${colId}`, { name: 'x' })).statusCode).toBe(403);
    expect((await call(editor, 'DELETE', `/api/columns/${colId}`)).statusCode).toBe(403);
    expect((await call(editor, 'PUT', `/api/boards/${boardId}/members/${viewer.id}`, { role: 'owner' })).statusCode).toBe(403);
  });

  it("editor cannot delete someone else's comment; owner can", async () => {
    const c = (await call(commenter, 'POST', `/api/tasks/${taskId}/comments`, { body: 'x' })).json();
    expect((await call(editor, 'DELETE', `/api/comments/${c.id}`)).statusCode).toBe(403);
    expect((await call(owner, 'DELETE', `/api/comments/${c.id}`)).statusCode).toBe(204);
  });

  it('owner: deletes any task, renames board, manages columns', async () => {
    const t = await addTask(editor, 'editors');
    expect((await call(owner, 'DELETE', `/api/tasks/${t.id}`)).statusCode).toBe(204);
    expect((await call(owner, 'PATCH', `/api/boards/${boardId}`, { name: 'Renamed' })).json()).toMatchObject({ name: 'Renamed', myRole: 'owner' });
    const col = await call(owner, 'POST', `/api/boards/${boardId}/columns`, { name: 'Extra' });
    expect(col.statusCode).toBe(201);
    expect((await call(owner, 'DELETE', `/api/columns/${col.json().id}`)).statusCode).toBe(204);
  });

  it('app admin: sees every board as owner without being a member, can act', async () => {
    const list = (await call(admin, 'GET', '/api/boards')).json();
    expect(list).toEqual([expect.objectContaining({ id: boardId, myRole: 'owner' })]);
    expect((await call(admin, 'DELETE', `/api/tasks/${taskId}`)).statusCode).toBe(204);
    expect((await call(admin, 'PUT', `/api/boards/${boardId}/members/${outsider.id}`, { role: 'viewer' })).statusCode).toBe(200);
  });

  it('members API: list, change role, last owner is protected, leaving, unknown user', async () => {
    const list = (await call(owner, 'GET', `/api/boards/${boardId}/members`)).json();
    expect(list.map((m: any) => [m.username, m.role]).sort()).toEqual([
      ['commenter', 'commenter'],
      ['editor', 'editor'],
      ['owner', 'owner'],
      ['viewer', 'viewer'],
    ]);
    expect(JSON.stringify(list)).not.toContain('hash');

    // единственного владельца нельзя ни понизить, ни убрать
    expect((await call(owner, 'PUT', `/api/boards/${boardId}/members/${owner.id}`, { role: 'editor' })).statusCode).toBe(400);
    expect((await call(owner, 'DELETE', `/api/boards/${boardId}/members/${owner.id}`)).statusCode).toBe(400);

    // второй владелец — теперь первого можно понизить
    await call(owner, 'PUT', `/api/boards/${boardId}/members/${editor.id}`, { role: 'owner' });
    expect((await call(owner, 'PUT', `/api/boards/${boardId}/members/${owner.id}`, { role: 'editor' })).statusCode).toBe(200);
    expect((await call(owner, 'PATCH', `/api/boards/${boardId}`, { name: 'x' })).statusCode).toBe(403);

    // участник может выйти сам; чужого убрать нельзя без прав
    expect((await call(viewer, 'DELETE', `/api/boards/${boardId}/members/${commenter.id}`)).statusCode).toBe(403);
    expect((await call(viewer, 'DELETE', `/api/boards/${boardId}/members/${viewer.id}`)).statusCode).toBe(204);
    expect((await call(viewer, 'GET', `/api/boards/${boardId}`)).statusCode).toBe(404);

    expect((await call(editor, 'PUT', `/api/boards/${boardId}/members/99999`, { role: 'viewer' })).statusCode).toBe(404);
    expect((await call(editor, 'PUT', `/api/boards/${boardId}/members/${outsider.id}`, { role: 'superuser' })).statusCode).toBe(400);
  });

  it('removing a member clears them as assignee on that board', async () => {
    await call(owner, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [editor.id] });
    await call(owner, 'DELETE', `/api/boards/${boardId}/members/${editor.id}`);
    expect((await call(owner, 'GET', `/api/tasks/${taskId}`)).json().assigneeIds).toEqual([]);
  });

  it('a new board created by a member is theirs; others do not see it', async () => {
    const mine = (await call(outsider, 'POST', '/api/boards', { name: 'Private' })).json();
    expect(mine.myRole).toBe('owner');
    expect((await call(owner, 'GET', `/api/boards/${mine.id}`)).statusCode).toBe(404);
    expect((await call(owner, 'GET', '/api/boards')).json().map((b: any) => b.id)).toEqual([boardId]);
  });
});
