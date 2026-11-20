import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatStatus = 'connecting' | 'open' | 'closed';

interface ChatUi {
  /** состояние WebSocket */
  status: ChatStatus;
  setStatus: (s: ChatStatus) => void;
  /** звук при новом сообщении (запоминается в браузере; по умолчанию включён) */
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

/** UI-состояние чата; сами сообщения — в TanStack Query */
export const useChatUi = create<ChatUi>()(
  persist(
    (set) => ({
      status: 'closed',
      setStatus: (status) => set({ status }),
      soundEnabled: true,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    { name: 'taskterm-chat', partialize: (s) => ({ soundEnabled: s.soundEnabled }) },
  ),
);
