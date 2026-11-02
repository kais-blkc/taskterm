/** Пути внутри приложения (react-router) */
export const ROUTES = {
  HOME: '/',
  /** регистрация по приглашению: /register?token=… */
  REGISTER: '/register',
  ADMIN: '/admin',
  BOARD: (boardId: number | string): string => `/b/${boardId}`,
  TASK: (boardId: number | string, taskId: number | string): string => `/b/${boardId}/t/${taskId}`,
};

/** Шаблоны для <Route path>; вложенный TASK — относительный к BOARD */
export const ROUTE_PATTERNS = {
  BOARD: 'b/:boardId',
  TASK: 't/:taskId',
  ADMIN: 'admin',
  NOT_FOUND: '*',
};
