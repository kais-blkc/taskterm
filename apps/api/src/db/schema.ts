import { sql } from 'drizzle-orm';
import { DEFAULT_TASK_POLICY, type TaskPolicy } from '@taskterm/shared';
import { boolean, customType, date, integer, jsonb, pgTable, primaryKey, serial, text } from 'drizzle-orm/pg-core';

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
  email: text('email').unique(),
  passwordHash: text('password_hash').notNull(),
  color: text('color').notNull().default(''),
  // глобальная роль; права на досках — отдельно (board_members, этап 3)
  role: text('role').$type<'admin' | 'member'>().notNull().default('member'),
  isActive: boolean('is_active').notNull().default(true),
  // растёт при смене пароля/роли, блокировке, «выйти везде» — старые access-токены перестают приниматься
  tokenVersion: integer('token_version').notNull().default(0),
  lastLoginAt: timestamptz('last_login_at'),
  createdAt: createdAt(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // цепочка ротаций одного входа: при повторном использовании старого токена отзывается вся цепочка
  familyId: text('family_id').notNull(),
  // sha256 токена из cookie — сам токен в БД не хранится
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  expiresAt: timestamptz('expires_at').notNull(),
  createdAt: createdAt(),
  revokedAt: timestamptz('revoked_at'),
  // выставлено, если токен отозван ротацией (а не выходом/блокировкой)
  rotatedAt: timestamptz('rotated_at'),
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

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: integer('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<'owner' | 'editor' | 'commenter' | 'viewer'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);

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
  // что остальные могут менять в задаче (решает owner задачи)
  policy: jsonb('policy').$type<TaskPolicy>().notNull().default(DEFAULT_TASK_POLICY),
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
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const invites = pgTable('invites', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  // sha256 токена из ссылки — сам токен в БД не хранится
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').$type<'admin' | 'member'>().notNull().default('member'),
  // доступ к доскам, который получит пользователь при регистрации
  boardGrants: jsonb('board_grants')
    .$type<{ boardId: number; role: 'owner' | 'editor' | 'commenter' | 'viewer' }[]>()
    .notNull()
    .default([]),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamptz('expires_at').notNull(),
  usedAt: timestamptz('used_at'),
  revokedAt: timestamptz('revoked_at'),
  createdAt: createdAt(),
});

/** Одноразовая ссылка сброса пароля, которую создаёт админ (почты нет — ссылку он пересылает сам) */
export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamptz('expires_at').notNull(),
  usedAt: timestamptz('used_at'),
  createdAt: createdAt(),
});

/** Журнал действий: кто, что и над чем сделал */
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  // имя на момент действия: после удаления пользователя запись остаётся читаемой
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull().default(''),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});
