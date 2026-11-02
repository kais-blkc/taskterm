import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLOR_MIN_DISTANCE, USER_PALETTE, colorDistance } from '@taskterm/shared';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { signupUser } from '../../test-utils';

describe('user colors', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp(loadConfig({ databaseUrl: ':memory:' }), { logger: false });
    await app.ready();
  });
  afterEach(() => app.close());

  const register = async (username: string) => {
    const res = await signupUser(app, username);
    return { cookie: `${res.cookies[0]!.name}=${res.cookies[0]!.value}`, user: res.json() };
  };

  it('palette colors are all distinguishable from each other', () => {
    for (let i = 0; i < USER_PALETTE.length; i++)
      for (let j = i + 1; j < USER_PALETTE.length; j++)
        expect(colorDistance(USER_PALETTE[i]!, USER_PALETTE[j]!), `${USER_PALETTE[i]} vs ${USER_PALETTE[j]}`).toBeGreaterThanOrEqual(
          COLOR_MIN_DISTANCE,
        );
  });

  it('gives every new user a unique, well-separated color', async () => {
    const colors: string[] = [];
    for (let i = 0; i < 10; i++) {
      const { user } = await register(`user${i}`);
      expect(user.color).toMatch(/^#[0-9a-f]{6}$/);
      colors.push(user.color);
    }
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++)
        expect(colorDistance(colors[i]!, colors[j]!)).toBeGreaterThan(40);
  });

  it('lets a user change color, rejects invalid and too-similar colors', async () => {
    const a = await register('alice');
    const b = await register('bob');
    const patch = (cookie: string, color: string) =>
      app.inject({ method: 'PATCH', url: '/api/users/me/color', payload: { color }, headers: { cookie } });

    expect((await patch(a.cookie, 'red')).statusCode).toBe(400);

    // цвет, почти идентичный цвету bob
    const nearBob = b.user.color.slice(0, 6) + (b.user.color.endsWith('0') ? '1' : '0');
    const clash = await patch(a.cookie, nearBob);
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error).toContain('@bob');

    // свой собственный цвет можно «пересохранить»
    expect((await patch(a.cookie, a.user.color)).statusCode).toBe(200);

    const free = USER_PALETTE.find((c) => colorDistance(c, b.user.color) >= COLOR_MIN_DISTANCE)!;
    const ok = await patch(a.cookie, free.toUpperCase());
    expect(ok.statusCode).toBe(200);
    expect(ok.json().color).toBe(free);

    const list = (await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: a.cookie } })).json();
    expect(list.find((u: any) => u.username === 'alice').color).toBe(free);
  });
});
