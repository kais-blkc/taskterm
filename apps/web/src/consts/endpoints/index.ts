import { ADMIN_ENDPOINTS } from './admin';
import { AUTH_ENDPOINTS } from './auth';
import { BOARDS_ENDPOINTS } from './boards';
import { CHAT_ENDPOINTS } from './chat';
import { EVENTS_ENDPOINTS } from './events';
import { INVITES_ENDPOINTS } from './invites';
import { TASKS_ENDPOINTS } from './tasks';
import { TELEGRAM_ENDPOINTS } from './telegram';
import { TIME_ENDPOINTS } from './time';
import { USERS_ENDPOINTS } from './users';

/** Префикс, который добавляет api-клиент ко всем путям из API_ENDPOINTS */
export const API_BASE = '/api';

export const API_ENDPOINTS = {
  ...AUTH_ENDPOINTS,
  ...BOARDS_ENDPOINTS,
  ...CHAT_ENDPOINTS,
  ...TASKS_ENDPOINTS,
  ...USERS_ENDPOINTS,
  ...EVENTS_ENDPOINTS,
  ...INVITES_ENDPOINTS,
  ...ADMIN_ENDPOINTS,
  ...TELEGRAM_ENDPOINTS,
  ...TIME_ENDPOINTS,
};
