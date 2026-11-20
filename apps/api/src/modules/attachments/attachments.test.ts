import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ATTACHMENTS } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';
import { parseRange } from './storage';

// минимальные настоящие файлы: PNG 1×1 и «видео» (заголовок ftyp mp4)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(16, 0)]);

function multipart(name: string, data: Buffer, type = 'application/octet-stream') {
  const boundary = '----tt' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('вложения задач', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dir: string;
  type U = { cookie: string; id: number };
  let owner: U, editor: U, viewer: U, stranger: U;
  let boardId: number, taskId: number;
  const hdr = (u: U) => ({ cookie: u.cookie });
  const mk = async (name: string): Promise<U> => {
    const res = await signupUser(app, name);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const json = (u: U, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, payload, headers: hdr(u) });
  const upload = (u: U, name: string, data: Buffer, tid = taskId) => {
    const m = multipart(name, data);
    return app.inject({ method: 'POST', url: `/api/tasks/${tid}/attachments`, payload: m.payload, headers: { ...hdr(u), ...m.headers } });
  };
  const filesOnDisk = async () => {
    const out: string[] = [];
    for (const d of await readdir(dir).catch(() => [])) for (const f of await readdir(join(dir, d))) out.push(`${d}/${f}`);
    return out;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tt-uploads-'));
    app = await buildApp(loadConfig({ databaseUrl: ':memory:', uploadsDir: dir, maxUploadBytes: 1024 }), { logger: false });
    await app.ready();
    owner = await mk('owner1');
    editor = await mk('editor1');
    viewer = await mk('viewer1');
    stranger = await mk('stranger1');
    boardId = (await json(owner, 'POST', '/api/boards', { name: 'B' })).json().id;
    await json(owner, 'PUT', `/api/boards/${boardId}/members/${editor.id}`, { role: 'editor' });
    await json(owner, 'PUT', `/api/boards/${boardId}/members/${viewer.id}`, { role: 'viewer' });
    const full = (await json(owner, 'GET', `/api/boards/${boardId}`)).json();
    taskId = (await json(owner, 'POST', `/api/boards/${boardId}/tasks`, { columnId: full.columns[0].id, title: 'T' })).json().id;
    await json(owner, 'PATCH', `/api/tasks/${taskId}`, { assigneeIds: [editor.id] }); // редактор правит только свои задачи
  });
  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('parseRange: диапазоны байтов', () => {
    expect(parseRange(undefined, 100)).toBe('none');
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBeNull();
    expect(parseRange('bytes=5-2', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });

  it('загрузка: редактор добавляет, тип определяется по содержимому, имя очищается', async () => {
    const res = await upload(editor, '../../evil/photo.png', PNG);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ taskId, name: 'photo.png', mime: 'image/png', size: PNG.length, uploadedBy: editor.id });
    // «видео» без расширения распознаётся по заголовку, а не по имени
    const v = await upload(editor, 'noext', MP4);
    expect(v.json().mime).toBe('video/mp4');
    const list = (await json(viewer, 'GET', `/api/tasks/${taskId}/attachments`)).json();
    expect(list.map((a: { name: string }) => a.name)).toEqual(['photo.png', 'noext']);
    expect((await filesOnDisk()).length).toBe(2);
  });

  it('права: viewer и чужой не загружают; чужой даже не видит задачу', async () => {
    expect((await upload(viewer, 'a.png', PNG)).statusCode).toBe(403);
    expect((await upload(stranger, 'a.png', PNG)).statusCode).toBe(404);
    expect((await json(stranger, 'GET', `/api/tasks/${taskId}/attachments`)).statusCode).toBe(404);
    expect((await json(viewer, 'GET', `/api/tasks/${taskId}/attachments`)).statusCode).toBe(200);
    expect(await filesOnDisk()).toEqual([]);
  });

  it('лимиты: не больше 10 файлов на задачу; больше размера — 413 и файла на диске нет', async () => {
    for (let i = 0; i < MAX_ATTACHMENTS; i++) expect((await upload(owner, `f${i}.png`, PNG)).statusCode).toBe(201);
    expect((await upload(owner, 'extra.png', PNG)).statusCode).toBe(409);
    const big = await upload(owner, 'big.bin', Buffer.alloc(2048, 1), (await taskOther()));
    expect(big.statusCode).toBe(413);
    expect((await filesOnDisk()).length).toBe(MAX_ATTACHMENTS);
    expect((await upload(owner, 'empty.bin', Buffer.alloc(0), await taskOther())).statusCode).toBe(400);
  });
  const taskOther = async () => {
    const full = (await json(owner, 'GET', `/api/boards/${boardId}`)).json();
    return (await json(owner, 'POST', `/api/boards/${boardId}/tasks`, { columnId: full.columns[0].id, title: 'T2' })).json().id as number;
  };

  it('отдача: картинка inline, неизвестный тип — только скачивание, Range для видео', async () => {
    const img = (await upload(owner, 'p.png', PNG)).json();
    const g = await json(viewer, 'GET', `/api/attachments/${img.id}`);
    expect(g.statusCode).toBe(200);
    expect(g.headers['content-type']).toBe('image/png');
    expect(g.headers['content-disposition']).toMatch(/^inline/);
    expect(g.headers['x-content-type-options']).toBe('nosniff');
    expect(g.rawPayload.equals(PNG)).toBe(true);

    const txt = (await upload(owner, 'notes.txt', Buffer.from('hello'))).json();
    const t = await json(owner, 'GET', `/api/attachments/${txt.id}`);
    expect(t.headers['content-type']).toBe('application/octet-stream');
    expect(t.headers['content-disposition']).toMatch(/^attachment/);

    const vid = (await upload(owner, 'v.mp4', MP4)).json();
    const part = await app.inject({ method: 'GET', url: `/api/attachments/${vid.id}`, headers: { ...hdr(owner), range: 'bytes=4-11' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 4-11/${MP4.length}`);
    expect(part.rawPayload.equals(MP4.subarray(4, 12))).toBe(true);
    const bad = await app.inject({ method: 'GET', url: `/api/attachments/${vid.id}`, headers: { ...hdr(owner), range: 'bytes=999-' } });
    expect(bad.statusCode).toBe(416);

    expect((await json(stranger, 'GET', `/api/attachments/${img.id}`)).statusCode).toBe(404);
  });

  it('удаление: убирает запись и файл; viewer не может', async () => {
    const a = (await upload(owner, 'p.png', PNG)).json();
    expect((await json(viewer, 'DELETE', `/api/attachments/${a.id}`)).statusCode).toBe(403);
    expect((await json(editor, 'DELETE', `/api/attachments/${a.id}`)).statusCode).toBe(204);
    expect(await filesOnDisk()).toEqual([]);
    expect((await json(owner, 'GET', `/api/attachments/${a.id}`)).statusCode).toBe(404);
  });

  it('чистка: файлы исчезают с диска при удалении задачи, колонки и доски; в доске приходит счётчик', async () => {
    await upload(owner, 'a.png', PNG);
    const board = (await json(owner, 'GET', `/api/boards/${boardId}`)).json();
    expect(board.attachmentStats).toEqual([{ taskId, count: 1 }]);

    expect((await json(owner, 'DELETE', `/api/tasks/${taskId}`)).statusCode).toBe(204);
    expect(await filesOnDisk()).toEqual([]);

    const t2 = await taskOther();
    await upload(owner, 'b.png', PNG, t2);
    const col = board.columns[0].id;
    expect((await json(owner, 'DELETE', `/api/columns/${col}`)).statusCode).toBe(204);
    expect(await filesOnDisk()).toEqual([]);

    const b2 = (await json(owner, 'POST', '/api/boards', { name: 'B2' })).json().id;
    const full = (await json(owner, 'GET', `/api/boards/${b2}`)).json();
    const t3 = (await json(owner, 'POST', `/api/boards/${b2}/tasks`, { columnId: full.columns[0].id, title: 'X' })).json().id;
    await upload(owner, 'c.png', PNG, t3);
    expect((await filesOnDisk()).length).toBe(1);
    expect((await json(owner, 'DELETE', `/api/boards/${b2}`)).statusCode).toBe(204);
    expect(await filesOnDisk()).toEqual([]);
  });
});
