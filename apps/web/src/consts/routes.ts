/** Пути внутри приложения (react-router) */
export const ROUTES = {
  HOME: '/',
  /** регистрация по приглашению: /register?token=… */
  REGISTER: '/register',
  ADMIN: '/admin',
  /** общий чат */
  CHAT: '/chat',
  /** админка → вкладка «доски» с подсвеченной доской */
  ADMIN_BOARD: (boardId: number | string): string => `/admin?tab=boards&board=${boardId}`,
  /** мои часы: записи таймера, отчёт за период */
  TIME: '/time',
  /** сброс пароля по ссылке от админа: /reset?token=… */
  RESET: '/reset',
  BOARD: (boardId: number | string): string => `/b/${boardId}`,
  TASK: (boardId: number | string, taskId: number | string): string => `/b/${boardId}/t/${taskId}`,
};

/** Шаблоны для <Route path>; вложенный TASK — относительный к BOARD */
export const ROUTE_PATTERNS = {
  BOARD: 'b/:boardId',
  TASK: 't/:taskId',
  ADMIN: 'admin',
  CHAT: 'chat',
  TIME: 'time',
  NOT_FOUND: '*',
};
