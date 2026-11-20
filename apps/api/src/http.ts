import { apiErrorSchema } from '@taskterm/shared';

/**
 * Запрос пришёл со «своего» источника? Заголовка Origin нет (curl, тесты) — пропускаем; иначе хост Origin должен совпасть с Host
 * или быть в ALLOWED_ORIGINS. Общая проверка для CSRF (изменяющие запросы) и WebSocket (чат).
 */
export function originAllowed(headers: { origin?: string; host?: string }, allowedOrigins: string[]): boolean {
  const origin = headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === headers.host || allowedOrigins.includes(origin);
  } catch {
    return false;
  }
}

const ERRORS = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  429: apiErrorSchema,
  503: apiErrorSchema,
};

/** Схемы ошибочных ответов для `response`: `errors(401, 403, 404)` → `{ 401: …, 403: …, 404: … }` */
export function errors<K extends keyof typeof ERRORS>(...codes: K[]): Pick<typeof ERRORS, K> {
  return Object.fromEntries(codes.map((c) => [c, ERRORS[c]])) as Pick<typeof ERRORS, K>;
}
