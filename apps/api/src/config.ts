import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export interface Config {
  port: number;
  databaseUrl: string;
  accessPassword: string;
  secureCookies: boolean;
  /** папка с собранным фронтом; если задана — API раздаёт SPA */
  staticDir?: string;
  migrationsDir: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: Number(process.env.PORT ?? 3100),
    databaseUrl: process.env.DATABASE_URL ?? './data/app.db',
    accessPassword: process.env.ACCESS_PASSWORD ?? 'change-me',
    // true только если приложение стоит за HTTPS; иначе по http cookie не сохранится
    secureCookies: process.env.COOKIE_SECURE === 'true',
    staticDir: process.env.STATIC_DIR || undefined,
    migrationsDir: process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, '../drizzle'),
    ...overrides,
  };
}
