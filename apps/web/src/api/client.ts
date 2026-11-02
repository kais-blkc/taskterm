import { API_BASE, API_ENDPOINTS } from '../consts/endpoints';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// эндпоинты, где 401 — это ответ по существу (неверный пароль), а не «протух access-токен»
const NO_REFRESH = new Set<string>([
  API_ENDPOINTS.AUTH_LOGIN,
  API_ENDPOINTS.AUTH_REGISTER,
  API_ENDPOINTS.AUTH_REFRESH,
]);

let refreshing: Promise<boolean> | null = null;

/** Обмен refresh-cookie на новую пару токенов. Параллельные запросы делят один обмен. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}${API_ENDPOINTS.AUTH_REFRESH}`, {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Вызывается, когда сессию не удалось продлить (refresh истёк/отозван): приложение показывает форму входа */
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(fn: (() => void) | null) {
  onSessionLost = fn;
}

async function send(path: string, init: { method?: string; body?: unknown }) {
  return fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && !NO_REFRESH.has(path)) {
    if (await refreshSession()) res = await send(path, init);
    else if (path !== API_ENDPOINTS.AUTH_ME) onSessionLost?.();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? data?.message ?? res.statusText, res.status);
  return data as T;
}
