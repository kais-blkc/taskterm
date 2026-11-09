import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { telegramLinkCodes, users } from '../../db/schema';
import { signupUser } from '../../test-utils';
import { TelegramError, type TelegramApi } from './api';
import { escapeHtml } from './bot';

function fakeApi() {
  const sent: { chatId: string; text: string }[] = [];
  const api: TelegramApi & { sent: typeof sent; failWith?: TelegramError } = {
    sent,
    getMe: async () => ({ username: 'testbot' }),
    getUpdates: async () => [],
    sendMessage: async (chatId, text) => {
      if (api.failWith) throw api.failWith;
      sent.push({ chatId, text });
    },
  };
  return api;
}

describe('telegram notifications', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let api: ReturnType<typeof fakeApi>;
  type U = { cookie: string; id: number };
  let alice: U, bob: U, carol: U;
  let boardId: number, colId: number, taskId: number;

  const call = (u: U, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const mk = async (name: string): Promise<U> => {
    const res = await signupUser(app, name);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const message = (chatId: number, text: string, type = 'private') =>
    app.telegram!.handleUpdate({ update_id: 1, message: { chat: { id: chatId, type }, text } });
  /** привязать чат пользователю через настоящий поток: ссылка → /start <код> */
  const link = async (u: U, chatId: number) => {
    const res = await call(u, 'POST', '/api/telegram/link');
    const code = new URL(res.json().url).searchParams.get('start')!;
    await message(chatId, `/start ${code}`);
    return code;
  };
  const settle = () => new Promise((r) => setTimeout(r, 80));

  beforeEach(async () => {
    api = fakeApi();
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', publicUrl: 'https://tt.example.com' }), { logger: false, telegram: api });
    await app.ready();
    [alice, bob, carol] = [await mk('alice'), await mk('bobby'), await mk('carol')] as [U, U, U];
    boardId = (await call(alice, 'POST', '/api/boards', { name: 'B' })).json().id;
    for (const u of [bob, carol]) await call(alice, 'PUT', `/api/boards/${boardId}/members/${u.id}`, { role: 'editor' });
    colId = (await call(alice, 'GET', `/api/boards/${boardId}`)).json().columns[0].id;
    taskId = (await call(alice, 'POST', `/api/boards/${boardId}/tasks`, { columnId: colId, title: 'Fix <b>login</b>' })).json().id;
  });
  afterEach(() => app.close());

  it('status and linking flow', async () => {
    expect((await call(alice, 'GET', '/api/telegram')).json()).toEqual({ enabled: true, botUsername: 'testbot', linked: false });
    const res = await call(alice, 'POST', '/api/telegram/link');
    expect(res.statusCode).toBe(201);
    expect(res.json().url).toMatch(/^https:\/\/t\.me\/testbot\?start=[\w-]{20,}$/);
    await link(alice, 111);
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(true);
    expect(api.sent.at(-1)).toMatchObject({ chatId: '111' });
    expect(api.sent.at(-1)!.text).toContain('@alice');
    // отвязка
    expect((await call(alice, 'DELETE', '/api/telegram')).statusCode).toBe(204);
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(false);
  });

  it('codes are one-time, expire, and garbage is refused', async () => {
    const code = await link(alice, 111);
    await message(222, `/start ${code}`); // тот же код ещё раз
    expect(api.sent.at(-1)!.text).toContain('недействителен');
    expect((await app.db.select().from(users).where(eq(users.id, alice.id)))[0]!.telegramChatId).toBe('111');

    await message(333, '/start garbage');
    expect(api.sent.at(-1)!.text).toContain('недействителен');

    const res = await call(bob, 'POST', '/api/telegram/link');
    await app.db.update(telegramLinkCodes).set({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    await message(444, `/start ${new URL(res.json().url).searchParams.get('start')}`);
    expect(api.sent.at(-1)!.text).toContain('недействителен');
    expect((await call(bob, 'GET', '/api/telegram')).json().linked).toBe(false);
  });

  it('a new link code voids the previous one; code is stored hashed', async () => {
    const a = (await call(bob, 'POST', '/api/telegram/link')).json().url as string;
    const b = (await call(bob, 'POST', '/api/telegram/link')).json().url as string;
    const rows = await app.db.select().from(telegramLinkCodes);
    expect(rows).toHaveLength(1);
    expect(a).not.toContain(rows[0]!.codeHash);
    await message(555, `/start ${new URL(a).searchParams.get('start')}`);
    expect((await call(bob, 'GET', '/api/telegram')).json().linked).toBe(false);
    await message(555, `/start ${new URL(b).searchParams.get('start')}`);
    expect((await call(bob, 'GET', '/api/telegram')).json().linked).toBe(true);
  });

  it('only private chats; /stop unlinks; one chat belongs to one account', async () => {
    const res = await call(alice, 'POST', '/api/telegram/link');
    await message(-100, `/start ${new URL(res.json().url).searchParams.get('start')}`, 'group');
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(false);

    await link(alice, 111);
    await link(bob, 111); // тот же чат переезжает на bob
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(false);
    expect((await call(bob, 'GET', '/api/telegram')).json().linked).toBe(true);
    await message(111, '/stop');
    expect((await call(bob, 'GET', '/api/telegram')).json().linked).toBe(false);
    await message(111, 'hello');
    expect(api.sent.at(-1)!.text).toContain('Подключить Telegram');
  });

  it('comment notification: goes to linked task author, escaped, with link; author of the comment gets nothing', async () => {
    await link(alice, 111);
    await link(bob, 222);
    api.sent.length = 0;
    await call(bob, 'POST', `/api/tasks/${taskId}/comments`, { body: 'see <script>alert(1)</script> & more' });
    await settle();
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.chatId).toBe('111');
    const text = api.sent[0]!.text;
    expect(text).toBe(
      [
        '<b>Доска:</b> B',
        '<b>Задача:</b> #1 Fix &lt;b&gt;login&lt;/b&gt;',
        '<b>Действие:</b> новый комментарий от @bobby',
        '<b>Комментарий:</b> see &lt;script&gt;alert(1)&lt;/script&gt; &amp; more',
        `https://tt.example.com/b/${boardId}/t/${taskId}`,
      ].join('\n'),
    );
    expect(text).toContain('@bobby');
    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more');
    expect(text).not.toContain('<script>');
    expect(text).toContain(`https://tt.example.com/b/${boardId}/t/${taskId}`);
  });

  it('assignment notification; self-assignment and unlinked users send nothing', async () => {
    await link(carol, 333);
    api.sent.length = 0;
    await call(alice, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [carol.id] });
    await settle();
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!).toMatchObject({ chatId: '333' });
    expect(api.sent[0]!.text).toContain('<b>Доска:</b> B');
    expect(api.sent[0]!.text).toContain('<b>Задача:</b> #1');
    expect(api.sent[0]!.text).toContain('<b>Действие:</b> вас назначили ответственным (@alice)');

    api.sent.length = 0;
    await call(alice, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [bob.id] }); // bob не привязан
    await settle();
    expect(api.sent).toHaveLength(0);
  });

  it('column "on enter" notification goes to chosen recipients only, never to the mover', async () => {
    const cols = (await call(alice, 'GET', `/api/boards/${boardId}`)).json().columns;
    const review = cols[2];
    await link(bob, 222);
    await link(carol, 333);
    await link(alice, 111);

    // по умолчанию выключено
    expect(review).toMatchObject({ notifyOnEnter: false, notifyUserIds: [] });
    const move = () => call(alice, 'POST', `/api/tasks/${taskId}/move`, { columnId: review.id, beforeId: null });
    api.sent.length = 0;
    await move();
    await settle();
    expect(api.sent).toHaveLength(0);
    await call(alice, 'POST', `/api/tasks/${taskId}/move`, { columnId: colId, beforeId: null });

    // получатели должны быть участниками доски; редактор не может
    const outsider = await mk('dave');
    const res0 = await signupUser(app, 'root', 'secret123', 'admin');
    const root: U = { cookie: `${res0.cookies[0]!.name}=${res0.cookies[0]!.value}`, id: res0.json().id };
    expect((await call(root, 'PATCH', `/api/columns/${review.id}`, { notifyUserIds: [outsider.id] })).statusCode).toBe(400);
    expect((await call(bob, 'PATCH', `/api/columns/${review.id}`, { notifyOnEnter: true })).statusCode).toBe(403);

    // даже владелец доски (не админ) уведомления колонки менять не может — только админ приложения
    expect((await call(alice, 'PATCH', `/api/columns/${review.id}`, { notifyOnEnter: true })).statusCode).toBe(403);
    // включаем: bob и сам alice (себе не придёт)
    const saved = await call(root, 'PATCH', `/api/columns/${review.id}`, { notifyOnEnter: true, notifyUserIds: [bob.id, alice.id] });
    expect(saved.json()).toMatchObject({ notifyOnEnter: true, notifyUserIds: [alice.id, bob.id].sort((a, b) => a - b) });
    expect(((await call(alice, 'GET', `/api/boards/${boardId}`)).json().columns[2])).toMatchObject({ notifyOnEnter: true });

    api.sent.length = 0;
    await move();
    await settle();
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]).toMatchObject({ chatId: '222' });
    expect(api.sent[0]!.text).toContain(`перенёс(ла) задачу в «${review.name}»`);

    // перенос внутри той же колонки — не событие
    api.sent.length = 0;
    await call(alice, 'POST', `/api/tasks/${taskId}/move`, { columnId: review.id, beforeId: null });
    await settle();
    expect(api.sent).toHaveLength(0);

    // участник ушёл с доски — из получателей убран
    await call(alice, 'DELETE', `/api/boards/${boardId}/members/${bob.id}`);
    expect((await call(alice, 'GET', `/api/boards/${boardId}`)).json().columns[2].notifyUserIds).toEqual([alice.id]);
  });

  it('a user removed from the board stops receiving notifications; blocked users too', async () => {
    await call(bob, 'POST', `/api/tasks/${taskId}/comments`, { body: 'first' }); // bob в обсуждении
    await link(bob, 222);
    api.sent.length = 0;
    await call(alice, 'DELETE', `/api/boards/${boardId}/members/${bob.id}`);
    await call(carol, 'POST', `/api/tasks/${taskId}/comments`, { body: 'second' });
    await settle();
    expect(api.sent).toHaveLength(0);
  });

  it('chat blocked the bot (403): link is dropped, nothing breaks', async () => {
    await link(alice, 111);
    api.failWith = new TelegramError('Forbidden: bot was blocked by the user', 403);
    const res = await call(bob, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' });
    expect(res.statusCode).toBe(201);
    await settle();
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(false);
  });

  it('other telegram errors keep the link', async () => {
    await link(alice, 111);
    api.failWith = new TelegramError('Too Many Requests', 429);
    await call(bob, 'POST', `/api/tasks/${taskId}/comments`, { body: 'hi' });
    await settle();
    expect((await call(alice, 'GET', '/api/telegram')).json().linked).toBe(true);
  });

  it('requires login; escapeHtml', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/telegram' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/telegram/link' })).statusCode).toBe(401);
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
  });
});

describe('telegram disabled', () => {
  it('without a token the feature is off', async () => {
    const app = await buildApp(loadConfig({ databaseUrl: ':memory:', telegramBotToken: undefined }), { logger: false });
    await app.ready();
    const res = await signupUser(app, 'alice');
    const cookie = `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;
    expect((await app.inject({ method: 'GET', url: '/api/telegram', headers: { cookie } })).json()).toEqual({ enabled: false, botUsername: null, linked: false });
    expect((await app.inject({ method: 'POST', url: '/api/telegram/link', headers: { cookie } })).statusCode).toBe(404);
    await app.close();
  });
});
