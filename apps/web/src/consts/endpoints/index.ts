import { AUTH_ENDPOINTS } from './auth';
import { BOARDS_ENDPOINTS } from './boards';
import { EVENTS_ENDPOINTS } from './events';
import { TASKS_ENDPOINTS } from './tasks';
import { USERS_ENDPOINTS } from './users';

/** Префикс, который добавляет api-клиент ко всем путям из API_ENDPOINTS */
export const API_BASE = '/api';

export const API_ENDPOINTS = {
  ...AUTH_ENDPOINTS,
  ...BOARDS_ENDPOINTS,
  ...TASKS_ENDPOINTS,
  ...USERS_ENDPOINTS,
  ...EVENTS_ENDPOINTS,
};
