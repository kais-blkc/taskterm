import type { ServerEvent } from '@taskterm/shared';

type Listener = (event: ServerEvent) => void;

/** Простой in-memory pub/sub: один процесс, SQLite — для локального сервера достаточно */
export class EventHub {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: ServerEvent) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        // ошибка одного подписчика не должна ломать остальных
      }
    }
  }

  get size() {
    return this.listeners.size;
  }
}
