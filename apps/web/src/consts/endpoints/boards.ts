export const BOARDS_ENDPOINTS = {
  BOARDS: '/boards',

  BOARD_ITEM: (id: number): string => `/boards/${id}`,
  BOARD_COLUMNS: (boardId: number): string => `/boards/${boardId}/columns`,
  BOARD_TASKS: (boardId: number): string => `/boards/${boardId}/tasks`,

  COLUMN_ITEM: (id: number): string => `/columns/${id}`,
};
