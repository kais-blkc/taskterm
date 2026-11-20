import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('порядок колонок', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  type U = { cookie: string; id: number };
  let owner: U, editor: U, admin: U, outsider: U;
  let boardId: number;
  const mk = async (name: string, role: 'admin' | 'member' = 'member'): Promise<U> => {
    const res = await signupUser(app, name, 'secret123', role);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, id: res.json().id };
  };
  const call = (u: U, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { cookie: u.cookie } });
  const names = async (u: U = owner) => (await call(u, 'GET', `/api/boards/${boardId}`)).json().columns.map((c: { name: string }) => c.name);
  const ids = async () => (await call(owner, 'GET', `/api/boards/${boardId}`)).json().columns.map((c: { id: number }) => c.id) as number[];

  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.ready();
    owner = await mk('owner1');
    editor = await mk('editor1');
    admin = await mk('rootadm', 'admin');
    outsider = await mk('outsider1');
    boardId = (await call(owner, 'POST', '/api/boards', { name: 'B' })).json().id;
    await call(owner, 'PUT', `/api/boards/${boardId}/members/${editor.id}`, { role: 'editor' });
  });
  afterEach(() => app.close());

  it('двигает колонку на место перед другой и в конец; порядок виден в доске', async () => {
    expect(await names()).toEqual(['Новые', 'В работе', 'На проверке', 'Сделано']);
    const [a, b, c, d] = await ids();
    // «Сделано» — перед «В работе»
    expect((await call(owner, 'POST', `/api/columns/${d}/move`, { beforeId: b })).statusCode).toBe(200);
    expect(await names()).toEqual(['Новые', 'Сделано', 'В работе', 'На проверке']);
    // «Новые» — в конец
    expect((await call(owner, 'POST', `/api/columns/${a}/move`, { beforeId: null })).statusCode).toBe(200);
    expect(await names()).toEqual(['Сделано', 'В работе', 'На проверке', 'Новые']);
    // в самое начало: перед первой
    expect((await call(owner, 'POST', `/api/columns/${a}/move`, { beforeId: d })).statusCode).toBe(200);
    expect(await names()).toEqual(['Новые', 'Сделано', 'В работе', 'На проверке']);
    // на то же место — без изменений
    await call(owner, 'POST', `/api/columns/${c}/move`, { beforeId: null });
    expect(await names()).toEqual(['Новые', 'Сделано', 'В работе', 'На проверке']);
  });

  it('новая колонка добавляется в конец и тоже двигается; много перестановок подряд не ломают порядок', async () => {
    const created = (await call(owner, 'POST', `/api/boards/${boardId}/columns`, { name: 'Extra' })).json();
    expect((await names()).at(-1)).toBe('Extra');
    const first = (await ids())[0]!;
    for (let i = 0; i < 30; i++) {
      await call(owner, 'POST', `/api/columns/${created.id}/move`, { beforeId: first });
      await call(owner, 'POST', `/api/columns/${created.id}/move`, { beforeId: null });
    }
    expect((await names()).at(-1)).toBe('Extra');
    await call(owner, 'POST', `/api/columns/${created.id}/move`, { beforeId: first });
    expect((await names())[0]).toBe('Extra');
    expect(await names()).toHaveLength(5);
  });

  it('права и ошибки: редактор 403, чужой 404, админ может; колонка с другой доски — 400', async () => {
    const [a, b] = await ids();
    expect((await call(editor, 'POST', `/api/columns/${a}/move`, { beforeId: b })).statusCode).toBe(403);
    expect((await call(outsider, 'POST', `/api/columns/${a}/move`, { beforeId: b })).statusCode).toBe(404);
    expect((await call(admin, 'POST', `/api/columns/${b}/move`, { beforeId: a })).statusCode).toBe(200);
    expect(await names()).toEqual(['В работе', 'Новые', 'На проверке', 'Сделано']);
    const other = (await call(owner, 'POST', '/api/boards', { name: 'Other' })).json().id;
    const foreign = (await call(owner, 'GET', `/api/boards/${other}`)).json().columns[0].id;
    expect((await call(owner, 'POST', `/api/columns/${a}/move`, { beforeId: foreign })).statusCode).toBe(400);
    expect((await call(owner, 'POST', `/api/columns/${a}/move`, { beforeId: a })).statusCode).toBe(400); // перед собой нельзя
    expect((await call(owner, 'POST', `/api/columns/9999/move`, { beforeId: null })).statusCode).toBe(404);
  });

  it('защищённая админом доска: двигать колонки может только админ', async () => {
    const protectedId = (await call(admin, 'POST', '/api/admin/boards', { name: 'P' })).json().id;
    await call(admin, 'PUT', `/api/boards/${protectedId}/members/${owner.id}`, { role: 'owner' });
    const cols = (await call(owner, 'GET', `/api/boards/${protectedId}`)).json().columns as { id: number }[];
    expect((await call(owner, 'POST', `/api/columns/${cols[0]!.id}/move`, { beforeId: null })).statusCode).toBe(403);
    expect((await call(admin, 'POST', `/api/columns/${cols[0]!.id}/move`, { beforeId: null })).statusCode).toBe(200);
  });

  it('«выполнено»: у новой доски — последняя колонка; выбирает админ, одна на доске; остальным нельзя', async () => {
    const board = (await call(owner, 'GET', `/api/boards/${boardId}`)).json();
    expect(board.columns.map((c: { isDone: boolean }) => c.isDone)).toEqual([false, false, false, true]);
    const [a, , c, d] = await ids();
    // владелец доски и редактор не выбирают
    expect((await call(owner, 'PATCH', `/api/columns/${c}`, { isDone: true })).statusCode).toBe(403);
    expect((await call(editor, 'PATCH', `/api/columns/${c}`, { isDone: true })).statusCode).toBe(403);
    // админ переносит отметку: прежняя снимается
    const res = await call(admin, 'PATCH', `/api/columns/${c}`, { isDone: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().isDone).toBe(true);
    const done = async () => ((await call(owner, 'GET', `/api/boards/${boardId}`)).json().columns as { id: number; isDone: boolean }[]).filter((x) => x.isDone).map((x) => x.id);
    expect(await done()).toEqual([c]);
    // переименование и перестановка отметку не трогают; снять можно совсем
    await call(owner, 'PATCH', `/api/columns/${c}`, { name: 'Готово' });
    await call(owner, 'POST', `/api/columns/${c}/move`, { beforeId: a });
    expect(await done()).toEqual([c]);
    expect((await call(admin, 'PATCH', `/api/columns/${c}`, { isDone: false })).statusCode).toBe(200);
    expect(await done()).toEqual([]);
    void d;
  });
});
