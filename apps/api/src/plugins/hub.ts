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

  /** Несколько событий подряд (сценарии сервисов возвращают списком) */
  emitAll(events: ServerEvent[]) {
    for (const e of events) this.emit(e);
  }

  private kickers = new Set<(userId: number) => void>();

  /** Закрыть открытые потоки пользователя (блокировка, смена роли, удаление) */
  onKick(fn: (userId: number) => void) {
    this.kickers.add(fn);
    return () => this.kickers.delete(fn);
  }

  kick(userId: number) {
    for (const fn of this.kickers) fn(userId);
  }

  get size() {
    return this.listeners.size;
  }
}
