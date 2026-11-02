import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_POLICY,
  canAddSubtask,
  canChangeSubtask,
  canCommentOn,
  canEditField,
  canManageTask,
  type TaskPolicy,
} from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('task policy rules (shared)', () => {
  const locked: TaskPolicy = { lockTitle: true, lockDescription: true, lockAssignee: true, lockDueDate: true, lockMove: true, commentsLocked: true, subtasks: 'check_only' };
  const editor = { role: 'editor', isOwner: false } as const;
  const taskOwner = { role: 'editor', isOwner: true } as const;
  const boardOwner = { role: 'owner', isOwner: false } as const;
  const demoted = { role: 'viewer', isOwner: true } as const;

  it('locked fields: only the task owner and board owner bypass', () => {
    for (const f of ['title', 'description', 'assignee', 'dueDate', 'move'] as const) {
      expect(canEditField(locked, editor, f), f).toBe(false);
      expect(canEditField(locked, taskOwner, f), f).toBe(true);
      expect(canEditField(locked, boardOwner, f), f).toBe(true);
      expect(canEditField(DEFAULT_TASK_POLICY, editor, f), f).toBe(true);
      expect(canEditField(DEFAULT_TASK_POLICY, { role: 'commenter', isOwner: false }, f), f).toBe(false);
    }
  });
  it('task owner demoted to viewer has no bypass at all', () => {
    expect(canEditField(DEFAULT_TASK_POLICY, demoted, 'title')).toBe(false);
    expect(canManageTask(demoted)).toBe(false);
    expect(canManageTask(editor)).toBe(false);
    expect(canManageTask(taskOwner)).toBe(true);
    expect(canManageTask(boardOwner)).toBe(true);
  });
  it('subtask modes', () => {
    const mode = (m: TaskPolicy['subtasks']): TaskPolicy => ({ ...DEFAULT_TASK_POLICY, subtasks: m });
    expect(canAddSubtask(mode('check_only'), editor)).toBe(false);
    expect(canAddSubtask(mode('check_and_add'), editor)).toBe(true);
    expect(canAddSubtask(mode('check_only'), taskOwner)).toBe(true);
    // чужой пункт / свой пункт / без автора
    expect(canChangeSubtask(mode('free'), editor, 99, 1)).toBe(true);
    expect(canChangeSubtask(mode('check_and_add'), editor, 99, 1)).toBe(false);
    expect(canChangeSubtask(mode('check_and_add'), editor, 1, 1)).toBe(true);
    expect(canChangeSubtask(mode('check_and_add'), editor, null, 1)).toBe(false);
    expect(canChangeSubtask(mode('check_only'), editor, 1, 1)).toBe(false);
    expect(canChangeSubtask(mode('check_only'), boardOwner, 99, 1)).toBe(true);
  });
  it('comments lock', () => {
    expect(canCommentOn(locked, { role: 'commenter', isOwner: false })).toBe(false);
    expect(canCommentOn(locked, taskOwner)).toBe(true);
    expect(canCommentOn(DEFAULT_TASK_POLICY, { role: 'commenter', isOwner: false })).toBe(true);
    expect(canCommentOn(DEFAULT_TASK_POLICY, { role: 'viewer', isOwner: false })).toBe(false);
  });
});

describe('task policy (API)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let boss: U, author: U, ed2: U, commenter: U, viewer: U, admin: U, outsider: U;
  let boardId: number, colId: number, col2Id: number, taskId: number;

  const call = (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const mk = async (username: string, role: 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, username, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const policy = (over: Partial<TaskPolicy>) => call(author, 'PUT', `/api/tasks/${taskId}/policy`, { ...DEFAULT_TASK_POLICY, ...over });
  const status = async (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    (await call(u, method, url, payload)).statusCode;

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.ready();
    [boss, author, ed2, commenter, viewer, admin, outsider] = [
      await mk('boss'), await mk('author'), await mk('editor2'), await mk('commenter'), await mk('viewer'), await mk('rootadm', 'admin'), await mk('outsider'),
    ] as [U, U, U, U, U, U, U];
    boardId = (await call(boss, 'POST', '/api/boards', { name: 'B' })).json().id;
    for (const [u, role] of [[author, 'editor'], [ed2, 'editor'], [commenter, 'commenter'], [viewer, 'viewer']] as const) {
      await call(boss, 'PUT', `/api/boards/${boardId}/members/${u.id}`, { role });
    }
    const cols = (await call(boss, 'GET', `/api/boards/${boardId}`)).json().columns;
    colId = cols[0].id;
    col2Id = cols[1].id;
    taskId = (await call(author, 'POST', `/api/boards/${boardId}/tasks`, { columnId: colId, title: 't', description: 'd' })).json().id;
  });
  afterEach(() => app.close());

  it('new task: author is owner, policy is "everything allowed"', async () => {
    const t = (await call(ed2, 'GET', `/api/tasks/${taskId}`)).json();
    expect(t.authorId).toBe(author.id);
    expect(t.policy).toEqual(DEFAULT_TASK_POLICY);
  });

  it('only task owner / board owner / admin change the policy', async () => {
    const body = { ...DEFAULT_TASK_POLICY, lockTitle: true };
    expect(await status(ed2, 'PUT', `/api/tasks/${taskId}/policy`, body)).toBe(403);
    expect(await status(commenter, 'PUT', `/api/tasks/${taskId}/policy`, body)).toBe(403);
    expect(await status(viewer, 'PUT', `/api/tasks/${taskId}/policy`, body)).toBe(403);
    expect(await status(outsider, 'PUT', `/api/tasks/${taskId}/policy`, body)).toBe(404);
    for (const u of [author, boss, admin]) {
      const res = await call(u, 'PUT', `/api/tasks/${taskId}/policy`, body);
      expect(res.statusCode).toBe(200);
      expect(res.json().policy.lockTitle).toBe(true);
    }
    expect(await status(author, 'PUT', `/api/tasks/${taskId}/policy`, { lockTitle: 'yes' })).toBe(400);
    expect(await status(author, 'PUT', `/api/tasks/${taskId}/policy`, { ...body, subtasks: 'nope' })).toBe(400);
  });

  it('locked fields: editor gets 403, owner/board owner/admin pass; unchanged value is not a change', async () => {
    await policy({ lockTitle: true, lockDescription: true, lockAssignee: true, lockDueDate: true, lockMove: true });
    const patches: object[] = [{ title: 'new' }, { description: 'new' }, { assigneeId: ed2.id }, { dueDate: '2030-01-01' }];
    for (const p of patches) expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, p), JSON.stringify(p)).toBe(403);
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/move`, { columnId: col2Id, beforeId: null })).toBe(403);
    // клиент прислал то же значение — не изменение
    expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, { title: 't', description: 'd' })).toBe(200);
    for (const [u, p] of [[author, patches[0]], [boss, patches[1]], [admin, patches[2]], [author, patches[3]]] as const) {
      expect(await status(u, 'PATCH', `/api/tasks/${taskId}`, p)).toBe(200);
    }
    expect(await status(boss, 'POST', `/api/tasks/${taskId}/move`, { columnId: col2Id, beforeId: null })).toBe(200);
  });

  it('only the locked field is locked', async () => {
    await policy({ lockDescription: true });
    expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, { description: 'x' })).toBe(403);
    expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, { title: 'ok' })).toBe(200);
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/move`, { columnId: col2Id, beforeId: null })).toBe(200);
    // смешанный патч с запрещённым полем не применяется частично
    expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, { title: 'mixed', description: 'x' })).toBe(403);
    expect((await call(ed2, 'GET', `/api/tasks/${taskId}`)).json().title).toBe('ok');
  });

  it('subtasks check_only: editors may only tick', async () => {
    const mine = (await call(author, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'a' })).json();
    expect(mine.createdBy).toBe(author.id);
    await policy({ subtasks: 'check_only' });
    expect(await status(ed2, 'PATCH', `/api/subtasks/${mine.id}`, { done: true })).toBe(200);
    expect(await status(ed2, 'PATCH', `/api/subtasks/${mine.id}`, { title: 'renamed' })).toBe(403);
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'b' })).toBe(403);
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/subtasks/bulk`, { items: [{ title: 'b' }] })).toBe(403);
    expect(await status(ed2, 'DELETE', `/api/subtasks/${mine.id}`)).toBe(403);
    // viewer/commenter не отмечают даже при мягкой политике
    expect(await status(commenter, 'PATCH', `/api/subtasks/${mine.id}`, { done: false })).toBe(403);
    // owner задачи и владелец доски — без ограничений
    expect(await status(author, 'POST', `/api/tasks/${taskId}/subtasks/bulk`, { items: [{ title: 'b' }] })).toBe(201);
    expect(await status(boss, 'PATCH', `/api/subtasks/${mine.id}`, { title: 'by boss' })).toBe(200);
    expect(await status(admin, 'DELETE', `/api/subtasks/${mine.id}`)).toBe(204);
  });

  it('subtasks check_and_add: add own, change only own', async () => {
    const theirs = (await call(author, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'author item' })).json();
    await policy({ subtasks: 'check_and_add' });
    const own = await call(ed2, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'my item' });
    expect(own.statusCode).toBe(201);
    const bulk = await call(ed2, 'POST', `/api/tasks/${taskId}/subtasks/bulk`, { items: [{ title: 'x' }, { title: 'y', done: true }] });
    expect(bulk.statusCode).toBe(201);
    expect(bulk.json().every((s: any) => s.createdBy === ed2.id)).toBe(true);

    expect(await status(ed2, 'PATCH', `/api/subtasks/${theirs.id}`, { done: true })).toBe(200); // отметить можно любой
    expect(await status(ed2, 'PATCH', `/api/subtasks/${theirs.id}`, { title: 'hijack' })).toBe(403);
    expect(await status(ed2, 'DELETE', `/api/subtasks/${theirs.id}`)).toBe(403);
    expect(await status(ed2, 'PATCH', `/api/subtasks/${own.json().id}`, { title: 'edited' })).toBe(200);
    expect(await status(ed2, 'DELETE', `/api/subtasks/${own.json().id}`)).toBe(204);
    // другой редактор не трогает пункт ed2
    const ed2Item = bulk.json()[0];
    expect(await status(author, 'DELETE', `/api/subtasks/${ed2Item.id}`)).toBe(204); // owner задачи — можно
  });

  it('comments locked: only the task owner and board owner can comment; reading stays open', async () => {
    await policy({ commentsLocked: true });
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' })).toBe(403);
    expect(await status(commenter, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' })).toBe(403);
    expect(await status(author, 'POST', `/api/tasks/${taskId}/comments`, { body: 'ok' })).toBe(201);
    expect(await status(boss, 'POST', `/api/tasks/${taskId}/comments`, { body: 'ok' })).toBe(201);
    expect(await status(viewer, 'GET', `/api/tasks/${taskId}/comments`)).toBe(200);
    await policy({ commentsLocked: false });
    expect(await status(commenter, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' })).toBe(201);
  });

  it('transfer: new owner gets the bypass, the old one loses it', async () => {
    await policy({ lockTitle: true });
    expect(await status(ed2, 'POST', `/api/tasks/${taskId}/owner`, { userId: ed2.id })).toBe(403); // не owner
    expect(await status(author, 'POST', `/api/tasks/${taskId}/owner`, { userId: commenter.id })).toBe(400); // не редактор
    expect(await status(author, 'POST', `/api/tasks/${taskId}/owner`, { userId: outsider.id })).toBe(400); // не участник
    const res = await call(boss, 'POST', `/api/tasks/${taskId}/owner`, { userId: ed2.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().authorId).toBe(ed2.id);

    expect(await status(author, 'PATCH', `/api/tasks/${taskId}`, { title: 'old owner' })).toBe(403);
    expect(await status(author, 'PUT', `/api/tasks/${taskId}/policy`, DEFAULT_TASK_POLICY)).toBe(403);
    expect(await status(ed2, 'PATCH', `/api/tasks/${taskId}`, { title: 'new owner' })).toBe(200);
    expect(await status(ed2, 'PUT', `/api/tasks/${taskId}/policy`, DEFAULT_TASK_POLICY)).toBe(200);
    expect(await status(admin, 'POST', `/api/tasks/${taskId}/owner`, { userId: boss.id })).toBe(200);
  });

  it('task owner demoted to viewer loses the bypass', async () => {
    await policy({ lockTitle: true });
    await call(boss, 'PUT', `/api/boards/${boardId}/members/${author.id}`, { role: 'viewer' });
    expect(await status(author, 'PATCH', `/api/tasks/${taskId}`, { title: 'x' })).toBe(403);
    expect(await status(author, 'PUT', `/api/tasks/${taskId}/policy`, DEFAULT_TASK_POLICY)).toBe(403);
  });
});
