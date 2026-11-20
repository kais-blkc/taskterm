import type { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAT_PAGE_SIZE } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';
import type { TelegramApi } from '../telegram/api';
import { sendChatDigest } from './jobs';
import { cleanupExpired } from './service';
import { chatMessages } from '../../db/schema';

type Frame = { type: string; [k: string]: unknown };

describe('общий чат', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let alice: U, bob: U, admin: U;
  const sent: { chatId: string; text: string }[] = [];
  const fake = {
    sendMessage: async (chatId: string, text: string) => void sent.push({ chatId, text }),
    getUpdates: async () => [],
    getMe: async () => ({ username: 'bot' }),
  } as unknown as TelegramApi;
  const mk = async (name: string, role: 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const call = (u: U, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  /** WebSocket-клиент с накоплением кадров */
  const open = async (u?: U, headers: Record<string, string> = {}) => {
    const ws: WebSocket = await app.injectWS('/api/chat/ws', { headers: { ...(u ? { cookie: u.cookie } : {}), ...headers } });
    const frames: Frame[] = [];
    let closed: number | null = null;
    ws.on('message', (m: Buffer) => frames.push(JSON.parse(m.toString())));
    ws.on('close', (code: number) => (closed = code));
    return { ws, frames, closedWith: () => closed, send: (f: object | string) => ws.send(typeof f === 'string' ? f : JSON.stringify(f)) };
  };
  type Room = { id: number; name: string; isGeneral: boolean; unread: number; muted: boolean };
  const rooms = async (u: U) => (await call(u, 'GET', '/api/chat/rooms')).json() as Room[];
  let general = 0;
  const messages = async (u: U, q = '') => (await call(u, 'GET', `/api/chat/messages${q}`)).json() as { messages: { id: number; roomId: number; text: string; authorId: number }[]; hasMore: boolean };
  const post = async (c: Awaited<ReturnType<typeof open>>, text: string, roomId = general) => {
    c.send({ type: 'send', roomId, text });
    await wait();
  };

  /** digestMs большой: сводку шлёт сам тест, таймер не мешает; его проверяет отдельный тест с коротким окном */
  const setup = async (digestMs = 600_000) => {
    sent.length = 0;
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', chatDigestMs: digestMs }), { logger: false, telegram: fake });
    await app.ready();
    alice = await mk('alice');
    bob = await mk('bob');
    admin = await mk('rootadm', 'admin');
    general = (await rooms(alice)).find((r) => r.isGeneral)!.id;
  };
  beforeEach(() => setup());
  afterEach(() => app.close());

  it('вход: без cookie и с чужого Origin соединение закрывается; с cookie приходит ready', async () => {
    const anon = await open();
    await wait();
    expect(anon.closedWith()).toBe(4401);
    const foreign = await open(alice, { origin: 'http://evil.example' });
    await wait();
    expect(foreign.closedWith()).toBe(4401);
    const ok = await open(alice);
    await wait();
    expect(ok.frames[0]).toEqual({ type: 'ready' });
    expect(ok.closedWith()).toBeNull();
  });

  it('сообщение уходит всем подключённым (и отправителю), сохраняется и видно в истории', async () => {
    const a = await open(alice);
    const b = await open(bob);
    await wait();
    await post(a, '  привет всем  ');
    for (const c of [a, b]) {
      const f = c.frames.find((x) => x.type === 'chat_message') as unknown as { message: { text: string; authorId: number } };
      expect(f.message).toMatchObject({ text: 'привет всем', authorId: alice.id });
    }
    expect((await messages(bob)).messages.map((m) => m.text)).toEqual(['привет всем']);
    // некорректные кадры и пустой текст — ошибка, а не сообщение
    a.send({ type: 'send', roomId: general, text: '   ' });
    a.send('not json');
    a.send({ type: 'nope' });
    a.send({ type: 'send', roomId: 99999, text: 'в никуда' }); // нет такой темы
    await wait();
    expect(a.frames.filter((x) => x.type === 'error')).toHaveLength(4);
    expect((await messages(bob)).messages).toHaveLength(1);
  });

  it('история постранично: последние N, старее — по курсору before', async () => {
    // лимит частоты — на соединение, поэтому шлём с нескольких
    const clients = [await open(alice), await open(alice), await open(alice), await open(alice)];
    await wait();
    for (let i = 1; i <= CHAT_PAGE_SIZE + 5; i++) {
      clients[0]!.send({ type: 'send', roomId: general, text: `m${i}` });
      await wait(8); // порядок сообщений = порядок отправки
      if (i % 15 === 0) clients.unshift(clients.pop()!);
    }
    await wait(150);
    const first = await messages(bob);
    expect(first.messages).toHaveLength(CHAT_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.messages.at(-1)!.text).toBe(`m${CHAT_PAGE_SIZE + 5}`);
    const older = await messages(bob, `?before=${first.messages[0]!.id}`);
    expect(older.messages.map((m) => m.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(older.hasMore).toBe(false);
    expect((await call(alice, 'GET', '/api/chat/messages')).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/chat/messages' })).statusCode).toBe(401);
  });

  it('частота: после лимита сообщений за окно — ошибка, лишние не сохраняются', async () => {
    const a = await open(alice);
    await wait();
    for (let i = 0; i < 25; i++) a.send({ type: 'send', roomId: general, text: `x${i}` });
    await wait(300);
    expect((await messages(alice)).messages).toHaveLength(20);
    expect(a.frames.some((f) => f.type === 'error')).toBe(true);
  });

  it('удаление по общей настройке: off — никому, own — автору, admin — ещё и админу; другим видно «удалено»', async () => {
    const a = await open(alice);
    const b = await open(bob);
    await wait();
    await post(a, 'one');
    await post(b, 'two');
    const [m1, m2] = (await messages(alice)).messages;
    const setMode = (deleteMode: string) => call(admin, 'PUT', '/api/admin/chat-settings', { retentionDays: 0, deleteMode });

    expect((await call(alice, 'GET', '/api/chat/state')).json().deleteMode).toBe('own'); // по умолчанию
    await setMode('off');
    expect((await call(alice, 'DELETE', `/api/chat/messages/${m1!.id}`)).statusCode).toBe(403);
    expect((await call(admin, 'DELETE', `/api/chat/messages/${m1!.id}`)).statusCode).toBe(403);

    await setMode('own');
    expect((await call(bob, 'DELETE', `/api/chat/messages/${m1!.id}`)).statusCode).toBe(403); // чужое
    expect((await call(admin, 'DELETE', `/api/chat/messages/${m1!.id}`)).statusCode).toBe(403);
    expect((await call(alice, 'DELETE', `/api/chat/messages/${m1!.id}`)).statusCode).toBe(204);
    expect(b.frames.some((f) => f.type === 'chat_deleted' && f.id === m1!.id)).toBe(true);

    await setMode('admin');
    expect((await call(admin, 'DELETE', `/api/chat/messages/${m2!.id}`)).statusCode).toBe(204);
    expect((await messages(alice)).messages).toEqual([]);
    expect((await call(alice, 'DELETE', `/api/chat/messages/${m2!.id}`)).statusCode).toBe(404);
    // настройки меняет только админ и только в допустимых границах
    expect((await call(alice, 'PUT', '/api/admin/chat-settings', { retentionDays: 0, deleteMode: 'own' })).statusCode).toBe(403);
    expect((await call(admin, 'PUT', '/api/admin/chat-settings', { retentionDays: -1, deleteMode: 'own' })).statusCode).toBe(400);
    expect((await call(admin, 'PUT', '/api/admin/chat-settings', { retentionDays: 30, deleteMode: 'any' })).statusCode).toBe(400);
  });

  it('срок хранения: устаревшие сообщения удаляются, свежие остаются; 0 — бессрочно', async () => {
    const a = await open(alice);
    await wait();
    await post(a, 'old');
    await post(a, 'fresh');
    const [old] = (await messages(alice)).messages;
    await app.db.update(chatMessages).set({ createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() }).where((await import('drizzle-orm')).eq(chatMessages.id, old!.id));
    expect(await cleanupExpired(app.db)).toBe(0); // бессрочно
    await call(admin, 'PUT', '/api/admin/chat-settings', { retentionDays: 30, deleteMode: 'own' });
    expect(await cleanupExpired(app.db)).toBe(1);
    expect((await messages(alice)).messages.map((m) => m.text)).toEqual(['fresh']);
  });

  it('непрочитанные по темам: считаются чужие; read по теме и по всем; назад не откатывается', async () => {
    const [, tasks] = await rooms(alice);
    const a = await open(alice);
    const b = await open(bob);
    await wait();
    await post(a, 'a1');
    await post(a, 'a2', tasks!.id);
    await post(b, 'b1');
    const byName = async (u: U) => Object.fromEntries((await rooms(u)).map((r) => [r.name, r.unread]));
    expect(await byName(bob)).toMatchObject({ General: 1, Tasks: 1, Guide: 0 });
    expect(await byName(alice)).toMatchObject({ General: 1, Tasks: 0 });
    // прочитал одну тему (REST), потом всё (WebSocket)
    expect((await call(bob, 'POST', '/api/chat/read', { roomId: general })).statusCode).toBe(204);
    expect(await byName(bob)).toMatchObject({ General: 0, Tasks: 1 });
    b.send({ type: 'read' });
    await wait();
    expect(await byName(bob)).toMatchObject({ General: 0, Tasks: 0 });
    await post(a, 'a3');
    expect((await byName(bob)).General).toBe(1);
  });

  it('темы: все видят, меняет только админ; General не удаляется; порядок и названия; сообщения удаляются вместе с темой', async () => {
    expect((await rooms(alice)).map((r) => r.name)).toEqual(['General', 'Tasks', 'Guide']);
    expect((await rooms(alice))[0]).toMatchObject({ isGeneral: true });
    expect((await call(alice, 'POST', '/api/chat/rooms', { name: 'Bugs' })).statusCode).toBe(403);
    const made = await call(admin, 'POST', '/api/chat/rooms', { name: '  Bugs  ' });
    expect(made.statusCode).toBe(201);
    const bugs = made.json().id as number;
    expect((await rooms(alice)).map((r) => r.name)).toEqual(['General', 'Tasks', 'Guide', 'Bugs']);
    expect((await call(admin, 'POST', '/api/chat/rooms', { name: '   ' })).statusCode).toBe(400);

    // порядок: Bugs — перед Tasks; потом в конец
    const [g, t, gd] = await rooms(alice);
    expect((await call(admin, 'POST', `/api/chat/rooms/${bugs}/move`, { beforeId: t!.id })).statusCode).toBe(204);
    expect((await rooms(alice)).map((r) => r.name)).toEqual(['General', 'Bugs', 'Tasks', 'Guide']);
    expect((await call(admin, 'POST', `/api/chat/rooms/${bugs}/move`, { beforeId: null })).statusCode).toBe(204);
    expect((await call(admin, 'POST', `/api/chat/rooms/${bugs}/move`, { beforeId: 9999 })).statusCode).toBe(400);
    expect((await call(alice, 'POST', `/api/chat/rooms/${bugs}/move`, { beforeId: g!.id })).statusCode).toBe(403);
    expect((await rooms(alice)).map((r) => r.name)).toEqual(['General', 'Tasks', 'Guide', 'Bugs']);

    expect((await call(admin, 'PATCH', `/api/chat/rooms/${bugs}`, { name: 'Баги' })).statusCode).toBe(204);
    expect((await rooms(bob)).at(-1)!.name).toBe('Баги');
    expect((await call(alice, 'PATCH', `/api/chat/rooms/${bugs}`, { name: 'x' })).statusCode).toBe(403);

    // сообщения темы удаляются вместе с ней; General не удалить
    const a = await open(alice);
    await wait();
    await post(a, 'в баги', bugs);
    await post(a, 'в общий');
    expect((await messages(bob, `?roomId=${bugs}`)).messages.map((m) => m.text)).toEqual(['в баги']);
    expect((await messages(bob)).messages.map((m) => m.text)).toEqual(['в баги', 'в общий']); // «Все»
    expect((await call(admin, 'DELETE', `/api/chat/rooms/${general}`)).statusCode).toBe(400);
    expect((await call(alice, 'DELETE', `/api/chat/rooms/${bugs}`)).statusCode).toBe(403);
    expect((await call(admin, 'DELETE', `/api/chat/rooms/${bugs}`)).statusCode).toBe(204);
    expect((await messages(bob)).messages.map((m) => m.text)).toEqual(['в общий']);
    expect(gd).toBeDefined();
  });

  it('события: создание/перемещение темы приходит подключённым клиентам', async () => {
    const b = await open(bob);
    await wait();
    await call(admin, 'POST', '/api/chat/rooms', { name: 'Docs' });
    await wait();
    expect(b.frames.some((f) => f.type === 'chat_rooms')).toBe(true);
  });

  it('«без звука» — личная настройка темы: счётчик остаётся, у других не меняется', async () => {
    const [, tasks] = await rooms(alice);
    expect((await call(bob, 'PUT', `/api/chat/rooms/${tasks!.id}/mute`, { muted: true })).statusCode).toBe(204);
    expect((await rooms(bob)).find((r) => r.name === 'Tasks')!.muted).toBe(true);
    expect((await rooms(alice)).find((r) => r.name === 'Tasks')!.muted).toBe(false);
    const a = await open(alice);
    await wait();
    await post(a, 'тихо', tasks!.id);
    expect((await rooms(bob)).find((r) => r.name === 'Tasks')).toMatchObject({ muted: true, unread: 1 });
    expect((await call(bob, 'PUT', '/api/chat/rooms/9999/mute', { muted: true })).statusCode).toBe(404);
  });

  it('заблокированному пользователю соединение закрывается сразу', async () => {
    const b = await open(bob);
    await wait();
    expect((await call(admin, 'PATCH', `/api/admin/users/${bob.id}`, { isActive: false })).statusCode).toBe(200);
    await wait();
    expect(b.closedWith()).toBe(4401);
  });

  describe('Telegram: сводка', () => {
    const link = async (u: U, chat: string) => {
      const l = (await call(u, 'POST', '/api/telegram/link')).json();
      await app.telegram!.handleUpdate({ update_id: 1, message: { chat: { id: chat, type: 'private' }, text: `/start ${l.url.split('start=')[1]}` } } as never);
    };
    beforeEach(async () => {
      await link(alice, 'chat-alice');
      await link(bob, 'chat-bob');
      sent.length = 0;
    });

    it('одна сводка на всех непрочитавших, кроме автора; повторно то же не шлётся; прочитавшему не шлётся', async () => {
      const a = await open(alice);
      await wait();
      await post(a, 'раз');
      await post(a, 'два <b>');
      await post(a, 'три');
      expect(await sendChatDigest(app.db, app.telegram!, 'https://tt.example')).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.chatId).toBe('chat-bob');
      expect(sent[0]!.text).toContain('3 новых сообщения от @alice');
      expect(sent[0]!.text).toContain('@alice: два &lt;b&gt;');
      expect(sent[0]!.text).toContain('https://tt.example/chat');
      expect(await sendChatDigest(app.db, app.telegram!)).toBe(0); // уже сообщали
      await post(a, 'четыре');
      const [last] = (await messages(bob)).messages.slice(-1);
      await call(bob, 'POST', '/api/chat/read', { id: last!.id });
      expect(await sendChatDigest(app.db, app.telegram!)).toBe(0); // bob прочитал
    });

    it('пользователь выключил чат в Telegram — сводка не приходит; статус и переключатель', async () => {
      expect((await call(bob, 'GET', '/api/telegram')).json()).toMatchObject({ linked: true, chatNotify: true });
      expect((await call(bob, 'PUT', '/api/telegram/chat-notify', { enabled: false })).json()).toEqual({ enabled: false });
      expect((await call(bob, 'GET', '/api/telegram')).json().chatNotify).toBe(false);
      const a = await open(alice);
      await wait();
      await post(a, 'тихо');
      expect(await sendChatDigest(app.db, app.telegram!)).toBe(0);
      await call(bob, 'PUT', '/api/telegram/chat-notify', { enabled: true });
      expect(await sendChatDigest(app.db, app.telegram!)).toBe(1);
    });

    it('сводка по темам: одна на все темы с разбивкой; тема «без звука» в неё не попадает', async () => {
      const [, tasks, guide] = await rooms(bob);
      await call(bob, 'PUT', `/api/chat/rooms/${guide!.id}/mute`, { muted: true });
      const a = await open(alice);
      await wait();
      await post(a, 'в общий');
      await post(a, 'в таски', tasks!.id);
      await post(a, 'в гайд', guide!.id);
      expect(await sendChatDigest(app.db, app.telegram!)).toBe(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.text).toContain('2 новых сообщения');
      expect(sent[0]!.text).toContain('General — 1, Tasks — 1');
      expect(sent[0]!.text).toContain('[Tasks] @alice: в таски');
      expect(sent[0]!.text).not.toContain('в гайд');
    });

    it('по таймеру: несколько сообщений подряд дают одну сводку', async () => {
      await app.close();
      await setup(60); // короткое окно сводки
      await link(alice, 'chat-alice');
      await link(bob, 'chat-bob');
      sent.length = 0;
      const a = await open(alice);
      await wait();
      for (const t of ['a', 'b', 'c']) a.send({ type: 'send', roomId: general, text: t });
      await wait(250);
      expect(sent.filter((m) => m.chatId === 'chat-bob')).toHaveLength(1);
      expect(sent.some((m) => m.chatId === 'chat-alice')).toBe(false);
    });
  });
});
