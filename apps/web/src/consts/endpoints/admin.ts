export const ADMIN_ENDPOINTS = {
  ADMIN_USERS: '/admin/users',
  ADMIN_USER_ITEM: (id: number): string => `/admin/users/${id}`,
  ADMIN_USER_RESET: (id: number): string => `/admin/users/${id}/reset-password`,
  ADMIN_BOARDS: '/admin/boards',
  ADMIN_AUDIT: '/admin/audit',
};
