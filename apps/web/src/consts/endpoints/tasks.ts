export const TASKS_ENDPOINTS = {
  TASK_ITEM: (id: number): string => `/tasks/${id}`,
  TASK_POLICY: (id: number): string => `/tasks/${id}/policy`,
  TASK_OWNER: (id: number): string => `/tasks/${id}/owner`,
  TASK_MOVE: (id: number): string => `/tasks/${id}/move`,
  TASK_COMMENTS: (taskId: number): string => `/tasks/${taskId}/comments`,

  TASK_SUBTASKS: (taskId: number): string => `/tasks/${taskId}/subtasks`,
  TASK_SUBTASKS_BULK: (taskId: number): string => `/tasks/${taskId}/subtasks/bulk`,

  SUBTASK_ITEM: (id: number): string => `/subtasks/${id}`,
  COMMENT_ITEM: (id: number): string => `/comments/${id}`,
};
