import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TelegramApi } from '../telegram/api';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('исполнитель подзадачи', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let owner: U, bob: U, carol: U, viewer: U, outsider: U;
  let boardId: number, taskId: number, subId: number;
  const sent: { chatId: string; text: string }[] = [];
  const fake: TelegramApi = {
    sendMessage: async (chatId: string, text: string) => void sent.push({ chatId, text }),
    getUpdates: async () => [],
    getMe: async () => ({ username: 'bot' }),
  } as unknown as TelegramApi;
  const mk = async (name: string): Promise<U> => {
    const res = await signupUser(app, name);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const call = (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const task = async () => (await call(owner, 'GET', `/api/tasks/${taskId}`)).json();
  const tick = () => new Promise((r) => setTimeout(r, 30));

  beforeEach(async () => {
    sent.length = 0;
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false, telegram: fake });
    await app.ready();
    owner = await mk('owner1');
    bob = await mk('bob1');
    carol = await mk('carol1');
    viewer = await mk('viewer1');
    outsider = await mk('outsider1');
    boardId = (await call(owner, 'POST', '/api/boards', { name: 'B' })).json().id;
    for (const [u, role] of [[bob, 'editor'], [carol, 'editor'], [viewer, 'viewer']] as const)
      await call(owner, 'PUT', `/api/boards/${boardId}/members/${u.id}`, { role });
    const full = (await call(owner, 'GET', `/api/boards/${boardId}`)).json();
    taskId = (await call(owner, 'POST', `/api/boards/${boardId}/tasks`, { columnId: full.columns[0].id, title: 'T' })).json().id;
    subId = (await call(owner, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'сверстать форму' })).json().id;
  });
  afterEach(() => app.close());

  it('назначение: исполнитель виден в пункте, а сам становится ответственным задачи', async () => {
    expect((await task()).assigneeIds).toEqual([]);
    const res = await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().assigneeId).toBe(bob.id);
    expect((await task()).assigneeIds).toEqual([bob.id]);
    // снять с пункта — ответственным задачи он остаётся
    expect((await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: null })).json().assigneeId).toBeNull();
    expect((await task()).assigneeIds).toEqual([bob.id]);
  });

  it('только участник доски; viewer и чужой не назначают', async () => {
    expect((await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: outsider.id })).statusCode).toBe(400);
    expect((await call(viewer, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id })).statusCode).toBe(403);
    expect((await call(outsider, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id })).statusCode).toBe(404);
  });

  it('политика: при ограничении назначает создатель пункта и owner, чужой редактор — нет; закрытые ответственные блокируют добавление нового', async () => {
    await call(owner, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [bob.id, carol.id] }); // оба — «свои» в задаче
    await call(owner, 'PUT', `/api/tasks/${taskId}/policy`, { lockTitle: false, lockDescription: false, lockAssignee: false, lockDueDate: false, lockMove: false, commentsLocked: false, subtasks: 'check_and_add' });
    const bobSub = (await call(bob, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'пункт боба' })).json().id;
    expect((await call(carol, 'PATCH', `/api/subtasks/${bobSub}`, { assigneeId: carol.id })).statusCode).toBe(403);
    expect((await call(bob, 'PATCH', `/api/subtasks/${bobSub}`, { assigneeId: carol.id })).statusCode).toBe(200);
    expect((await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id })).statusCode).toBe(200);

    await call(owner, 'PUT', `/api/tasks/${taskId}/policy`, { lockTitle: false, lockDescription: false, lockAssignee: true, lockDueDate: false, lockMove: false, commentsLocked: false, subtasks: 'free' });
    // carol уже ответственная (добавлена выше) — можно; новый человек — это правка ответственных, закрытая политикой
    const free = (await call(bob, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'ещё' })).json().id;
    expect((await call(bob, 'PATCH', `/api/subtasks/${free}`, { assigneeId: carol.id })).statusCode).toBe(200);
    await call(owner, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [bob.id] }); // carol снята с задачи
    expect((await call(bob, 'PATCH', `/api/subtasks/${free}`, { assigneeId: carol.id })).statusCode).toBe(403);
    expect((await call(owner, 'PATCH', `/api/subtasks/${free}`, { assigneeId: carol.id })).statusCode).toBe(200);
  });

  it('снятие с задачи (и выход с доски) убирает человека и с её подзадач', async () => {
    await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id });
    const second = (await call(owner, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'второй' })).json().id;
    await call(owner, 'PATCH', `/api/subtasks/${second}`, { assigneeId: carol.id });
    await call(owner, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [carol.id] }); // bob снят с задачи
    const list = (await call(owner, 'GET', `/api/tasks/${taskId}/subtasks`)).json();
    expect(list.map((s: { assigneeId: number | null }) => s.assigneeId)).toEqual([null, carol.id]);
    await call(owner, 'DELETE', `/api/boards/${boardId}/members/${carol.id}`);
    const after = (await call(owner, 'GET', `/api/tasks/${taskId}/subtasks`)).json();
    expect(after.map((s: { assigneeId: number | null }) => s.assigneeId)).toEqual([null, null]);
  });

  it('сводка на доске: у каждого исполнителя сколько пунктов и сколько сделано', async () => {
    const s2 = (await call(owner, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'b' })).json().id;
    const s3 = (await call(owner, 'POST', `/api/tasks/${taskId}/subtasks`, { title: 'c' })).json().id;
    await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id });
    await call(owner, 'PATCH', `/api/subtasks/${s2}`, { assigneeId: bob.id, done: true });
    await call(owner, 'PATCH', `/api/subtasks/${s3}`, { assigneeId: carol.id });
    const stats = (await call(owner, 'GET', `/api/boards/${boardId}`)).json().subtaskStats;
    expect(stats).toEqual([
      { taskId, total: 3, done: 1, assignees: [{ userId: bob.id, total: 2, done: 1 }, { userId: carol.id, total: 1, done: 0 }] },
    ]);
  });

  it('уведомления в Telegram: назначили / сняли / переназначили (себя не уведомляем)', async () => {
    for (const [u, chat] of [[bob, 'chat-bob'], [carol, 'chat-carol'], [owner, 'chat-owner']] as const) {
      const link = (await call(u, 'POST', '/api/telegram/link')).json();
      await app.telegram!.handleUpdate({ update_id: 1, message: { chat: { id: chat, type: 'private' }, text: `/start ${link.url.split('start=')[1]}` } } as never);
    }
    sent.length = 0;
    await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: bob.id });
    await tick();
    const toBob = sent.filter((m) => m.chatId === 'chat-bob');
    expect(toBob).toHaveLength(1);
    expect(toBob[0]!.text).toContain('назначили исполнителем подзадачи');
    expect(toBob[0]!.text).toContain('сверстать форму');
    expect(sent.some((m) => m.chatId === 'chat-owner')).toBe(false); // самому себе — нет

    sent.length = 0;
    await call(owner, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: carol.id });
    await tick();
    expect(sent.find((m) => m.chatId === 'chat-bob')!.text).toContain('сняли с подзадачи');
    expect(sent.find((m) => m.chatId === 'chat-carol')!.text).toContain('назначили исполнителем подзадачи');

    sent.length = 0;
    await call(carol, 'PATCH', `/api/subtasks/${subId}`, { assigneeId: null }); // сама себя сняла
    await tick();
    expect(sent).toHaveLength(0);
  });
});
