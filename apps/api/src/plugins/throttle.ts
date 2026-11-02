/** Счётчик неудачных входов по ключу (ip|логин): после max промахов за окно — отказ без проверки пароля */
export class FailureThrottle {
  private readonly hits = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** секунд до разблокировки или 0, если можно пробовать */
  retryAfter(key: string): number {
    const h = this.hits.get(key);
    if (!h) return 0;
    const left = h.since + this.windowMs - Date.now();
    if (left <= 0) {
      this.hits.delete(key);
      return 0;
    }
    return h.count >= this.max ? Math.ceil(left / 1000) : 0;
  }

  fail(key: string) {
    const h = this.hits.get(key);
    if (!h || h.since + this.windowMs <= Date.now()) this.hits.set(key, { count: 1, since: Date.now() });
    else h.count++;
    if (this.hits.size > 10_000) this.hits.clear(); // защита от раздувания памяти
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
