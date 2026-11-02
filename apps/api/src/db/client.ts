import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

/** Общий тип для обоих драйверов (postgres-js в проде, pglite в тестах) и для транзакций */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

const templates = new Map<string, Promise<File | Blob>>();

/** `:memory:` — встроенный Postgres (pglite) в памяти, для тестов; иначе строка подключения postgres:// */
export async function createDb(url: string, migrationsFolder: string): Promise<DbHandle> {
  if (url === ':memory:') {
    // pglite нужен только тестам: грузим лениво и не кладём в прод-бандл
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
    const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');
    // миграции прогоняем один раз на папку и клонируем готовую БД — тесты стартуют быстро
    let template = templates.get(migrationsFolder);
    if (!template) {
      template = (async () => {
        const seed = new PGlite();
        await migratePglite(drizzlePglite(seed, { schema }), { migrationsFolder });
        const dump = await seed.dumpDataDir('none');
        await seed.close();
        return dump;
      })();
      templates.set(migrationsFolder, template);
    }
    const client = new PGlite({ loadDataDir: await template });
    return { db: drizzlePglite(client, { schema }), close: () => client.close() };
  }
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzlePg(client, { schema });
  await migratePg(db, { migrationsFolder });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/** Первая строка результата (аналог .get() из better-sqlite3) */
export function first<T>(rows: T[]): T | undefined {
  return rows[0];
}
