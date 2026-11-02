import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export interface Config {
  port: number;
  databaseUrl: string;
  /** временный ключ регистрации; уйдёт на этапе «инвайты» */
  accessPassword: string;
  /** секрет подписи access JWT (HS256), в проде ≥ 32 символов */
  jwtSecret: string;
  secureCookies: boolean;
  /** папка с собранным фронтом; если задана — API раздаёт SPA */
  staticDir?: string;
  migrationsDir: string;
  /** первый админ (см. modules/auth/bootstrap.ts) */
  adminUsername?: string;
  adminPassword?: string;
  adminEmail?: string;
  /** запросов к login/register/refresh с одного IP за 15 минут */
  authRateLimitMax: number;
  /** неудачных входов на пару ip+логин за 15 минут до блокировки */
  loginFailMax: number;
  /** true, если API стоит за reverse proxy (Caddy): берём IP клиента из X-Forwarded-For */
  trustProxy: boolean;
  /** дополнительные Origin, с которых разрешены изменяющие запросы (кроме своего хоста) */
  allowedOrigins: string[];
}

export const DEV_JWT_SECRET = 'dev-only-secret-change-me-dev-only-secret';

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3100),
    databaseUrl: env.DATABASE_URL ?? 'postgres://taskterm:taskterm@localhost:5442/taskterm',
    accessPassword: env.ACCESS_PASSWORD ?? 'change-me',
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    // true только если приложение стоит за HTTPS; иначе по http cookie не сохранится
    secureCookies: env.COOKIE_SECURE === 'true',
    staticDir: env.STATIC_DIR || undefined,
    migrationsDir: env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, '../drizzle-pg'),
    adminUsername: env.ADMIN_USERNAME || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    adminEmail: env.ADMIN_EMAIL || undefined,
    authRateLimitMax: Number(env.AUTH_RATE_LIMIT_MAX ?? 30),
    loginFailMax: Number(env.LOGIN_FAIL_MAX ?? 8),
    trustProxy: env.TRUST_PROXY === 'true',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ...overrides,
  };
}
