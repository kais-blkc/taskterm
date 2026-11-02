import { register } from './modules/auth/service';
import type { GlobalRole } from '@taskterm/shared';
import type { buildApp } from './app';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Тестовый пользователь без приглашения: создаётся прямо в БД и сразу входит.
 * Возвращает ответ /auth/login (cookies[0] — access, json() — Me).
 */
export async function signupUser(app: App, username: string, password = 'secret123', role: GlobalRole = 'member') {
  await register(app.db, username, password, role);
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
}
