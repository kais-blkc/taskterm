export const CHAT_ENDPOINTS = {
  CHAT_STATE: '/chat/state',
  CHAT_ROOMS: '/chat/rooms',
  CHAT_ROOM_ITEM: (id: number): string => `/chat/rooms/${id}`,
  CHAT_ROOM_MOVE: (id: number): string => `/chat/rooms/${id}/move`,
  CHAT_ROOM_MUTE: (id: number): string => `/chat/rooms/${id}/mute`,
  CHAT_MESSAGES: '/chat/messages',
  CHAT_READ: '/chat/read',
  CHAT_MESSAGE_ITEM: (id: number): string => `/chat/messages/${id}`,
  /** WebSocket общего чата (протокол ws/wss выбирается по адресу страницы) */
  CHAT_WS: '/chat/ws',
};
