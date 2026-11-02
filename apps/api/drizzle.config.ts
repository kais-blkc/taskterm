import { defineConfig } from 'drizzle-kit';

// Миграции Postgres. Старые SQLite-миграции лежат в ./drizzle (архив, не трогаем и не применяем).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle-pg',
});
