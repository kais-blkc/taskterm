import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // каждый тест-файл (отдельный воркер) один раз поднимает pglite и прогоняет миграции —
    // при параллельном запуске всех файлов это занимает заметно больше дефолтных 10 с
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // тесты читают тот же .env: без этого они запустили бы опрос настоящего бота
    env: { TELEGRAM_BOT_TOKEN: '', PUBLIC_URL: '' },
  },
});
