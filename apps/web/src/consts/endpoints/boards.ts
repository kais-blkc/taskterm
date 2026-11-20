export const BOARDS_ENDPOINTS = {
  BOARDS: '/boards',

  BOARD_ITEM: (id: number): string => `/boards/${id}`,
  BOARD_COLUMNS: (boardId: number): string => `/boards/${boardId}/columns`,
  BOARD_MEMBERS: (boardId: number): string => `/boards/${boardId}/members`,
  BOARD_MEMBER: (boardId: number, userId: number): string => `/boards/${boardId}/members/${userId}`,
  BOARD_TASKS: (boardId: number): string => `/boards/${boardId}/tasks`,

  COLUMN_ITEM: (id: number): string => `/columns/${id}`,
  COLUMN_MOVE: (id: number): string => `/columns/${id}/move`,
};
