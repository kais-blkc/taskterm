import { buildApp } from './app';
import { DEV_JWT_SECRET, loadConfig } from './config';

const config = loadConfig();
const prod = process.env.NODE_ENV === 'production';
if (config.accessPassword === 'change-me') {
  if (prod) {
    console.error('[fatal] ACCESS_PASSWORD не задан. Задай его в .env');
    process.exit(1);
  }
  console.warn('[warn] ACCESS_PASSWORD не задан — используется "change-me". Создай .env');
}
if (config.jwtSecret === DEV_JWT_SECRET || config.jwtSecret.length < 32) {
  if (prod) {
    console.error('[fatal] JWT_SECRET не задан или короче 32 символов (openssl rand -base64 48)');
    process.exit(1);
  }
  console.warn('[warn] JWT_SECRET не задан — dev-значение. Токены не годятся для прода');
}

const app = await buildApp(config);
await app.listen({ port: config.port, host: '0.0.0.0' });

// docker stop шлёт SIGTERM: закрываем сервер и соединения с БД
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal}: shutting down`);
    app.close().finally(() => process.exit(0));
  });
}
