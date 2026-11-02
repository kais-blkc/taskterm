/**
 * Одноразовый перенос данных из dev-SQLite в Postgres.
 *
 *   pnpm --filter @taskterm/api exec tsx scripts/sqlite-to-pg.ts ./data/app.db [postgres://...]
 *
 * - URL Postgres: второй аргумент или DATABASE_URL (из .env). Миграции применяются сами.
 * - Целевая БД должна быть пустой (нет пользователей) — иначе скрипт ничего не трогает.
 * - id сохраняются, последовательности выставляются после копирования.
 * - Сессии не переносятся: все входят заново.
 * - Читаем SQLite встроенным node:sqlite — отдельных зависимостей не нужно.
 */
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import * as t from '../src/db/schema';

const [src, urlArg] = process.argv.slice(2);
if (!src) {
  console.error('usage: sqlite-to-pg.ts <app.db> [postgres-url]');
  process.exit(1);
}
const config = loadConfig(urlArg ? { databaseUrl: urlArg } : {});
if (config.databaseUrl === ':memory:') throw new Error('нужен реальный Postgres');

const lite = new DatabaseSync(resolve(src), { readOnly: true });
const rows = (table: string) => lite.prepare(`select * from ${table} order by id`).all() as Record<string, any>[];
// SQLite хранила UTC как 'YYYY-MM-DD HH:MM:SS'
const ts = (v: string | null) => (v ? `${v.replace(' ', 'T')}Z` : null);

const { db, close } = await createDb(config.databaseUrl, config.migrationsDir);
try {
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from users`)) as unknown as { n: number }[];
  if (n > 0) throw new Error(`в целевой БД уже есть пользователи (${n}) — перенос отменён`);

  await db.transaction(async (tx) => {
    const users = rows('users');
    if (users.length)
      await tx.insert(t.users).values(
        users.map((r) => ({ id: r.id, username: r.username, passwordHash: r.password_hash, color: r.color, createdAt: ts(r.created_at)! })),
      );
    const boards = rows('boards');
    if (boards.length)
      await tx.insert(t.boards).values(
        boards.map((r) => ({ id: r.id, name: r.name, nextTaskNumber: r.next_task_number, createdBy: r.created_by, createdAt: ts(r.created_at)! })),
      );
    const columns = rows('columns');
    if (columns.length)
      await tx.insert(t.columns).values(columns.map((r) => ({ id: r.id, boardId: r.board_id, name: r.name, position: r.position })));
    const tasks = rows('tasks');
    if (tasks.length)
      await tx.insert(t.tasks).values(
        tasks.map((r) => ({
          id: r.id,
          boardId: r.board_id,
          columnId: r.column_id,
          number: r.number,
          title: r.title,
          description: r.description,
          position: r.position,
          authorId: r.author_id,
          assigneeId: r.assignee_id,
          dueDate: r.due_date,
          createdAt: ts(r.created_at)!,
          updatedAt: ts(r.updated_at)!,
        })),
      );
    const comments = rows('comments');
    if (comments.length)
      await tx.insert(t.comments).values(
        comments.map((r) => ({ id: r.id, taskId: r.task_id, authorId: r.author_id, body: r.body, createdAt: ts(r.created_at)!, editedAt: ts(r.edited_at) })),
      );
    const subtasks = rows('subtasks');
    if (subtasks.length)
      await tx.insert(t.subtasks).values(
        subtasks.map((r) => ({ id: r.id, taskId: r.task_id, title: r.title, done: !!r.done, createdAt: ts(r.created_at)! })),
      );

    // serial-последовательности после вставки с явными id
    for (const table of ['users', 'boards', 'columns', 'tasks', 'comments', 'subtasks']) {
      await tx.execute(
        sql.raw(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 1), (select count(*) > 0 from ${table}))`),
      );
    }
    console.log(
      `перенесено: users ${users.length}, boards ${boards.length}, columns ${columns.length}, tasks ${tasks.length}, comments ${comments.length}, subtasks ${subtasks.length}`,
    );
  });
} finally {
  await close();
  lite.close();
}
