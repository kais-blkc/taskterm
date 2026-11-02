import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
if (config.accessPassword === 'change-me') {
  if (process.env.NODE_ENV === 'production') {
    console.error('[fatal] ACCESS_PASSWORD не задан. Задай его в .env');
    process.exit(1);
  }
  console.warn('[warn] ACCESS_PASSWORD не задан — используется "change-me". Создай .env');
}

const app = buildApp(config);
await app.listen({ port: config.port, host: '0.0.0.0' });

// docker stop шлёт SIGTERM: закрываем сервер и БД (корректный checkpoint WAL)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal}: shutting down`);
    app.close().finally(() => process.exit(0));
  });
}
