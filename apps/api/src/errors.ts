/** Ошибки с HTTP-статусом: обработчик в app.ts отдаёт их как `{ error: message }` */
export class NotFoundError extends Error {
  status = 404;
}
export class ForbiddenError extends Error {
  status = 403;
}
