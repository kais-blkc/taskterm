import { sql } from 'drizzle-orm';
import { boolean, customType, date, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * timestamptz, наружу всегда ISO-строка (`2026-11-02T12:00:00.000Z`).
 * drizzle для postgres-js и pglite отдаёт сырые строки разного формата — приводим к одному.
 */
const timestamptz = customType<{ data: string; driverData: string | Date }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (v) => new Date(v).toISOString(),
  toDriver: (v) => v,
});

const createdAt = () => timestamptz('created_at').notNull().default(sql`now()`);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  color: text('color').notNull().default(''),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  // sha256 от токена из cookie — сам токен в БД не хранится
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamptz('expires_at').notNull(),
});

export const boards = pgTable('boards', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  nextTaskNumber: integer('next_task_number').notNull().default(1),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const columns = pgTable('columns', {
  id: serial('id').primaryKey(),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position').notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  columnId: integer('column_id')
    .notNull()
    .references(() => columns.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  position: text('position').notNull(),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id),
  assigneeId: integer('assignee_id').references(() => users.id),
  dueDate: date('due_date', { mode: 'string' }), // YYYY-MM-DD
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().default(sql`now()`),
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
  editedAt: timestamptz('edited_at'),
});

export const subtasks = pgTable('subtasks', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: createdAt(),
});
