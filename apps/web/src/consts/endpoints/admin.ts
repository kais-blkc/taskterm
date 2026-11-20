export const ADMIN_ENDPOINTS = {
  ADMIN_USERS: '/admin/users',
  ADMIN_USER_ITEM: (id: number): string => `/admin/users/${id}`,
  ADMIN_USER_RATE: (id: number) => `/admin/users/${id}/rate`,
  ADMIN_USER_RESET: (id: number): string => `/admin/users/${id}/reset-password`,
  ADMIN_BOARDS: '/admin/boards',
  ADMIN_BOARD_ITEM: (id: number): string => `/admin/boards/${id}`,
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_CHAT_SETTINGS: '/admin/chat-settings',
  ADMIN_NOTIFY_SETTINGS: '/admin/notify-settings',
};
