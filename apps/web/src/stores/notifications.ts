import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotifyState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

export const useNotifyStore = create<NotifyState>()(
  persist((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }), {
    name: 'taskterm-notify',
  }),
);

export const notificationsSupported = () => typeof Notification !== 'undefined';
