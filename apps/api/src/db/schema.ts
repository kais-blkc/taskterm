import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  color: text('color').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable('sessions', {
  // sha256 от токена из cookie — сам токен в БД не хранится
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(), // unix ms
});

export const boards = sqliteTable('boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  nextTaskNumber: integer('next_task_number').notNull().default(1),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const columns = sqliteTable('columns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: text('position').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
  dueDate: text('due_date'), // YYYY-MM-DD
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  editedAt: text('edited_at'),
});

export const subtasks = sqliteTable('subtasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
