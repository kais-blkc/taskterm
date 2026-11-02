// Рендер без ручных действий: открывает редактор Motion Canvas в headless Chrome и нажимает RENDER.
// Использование: node scripts/render.mjs [выходной.mp4]
import { existsSync, rmSync, statSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'output');
const target = resolve(process.argv[2] ?? resolve(root, 'taskterm-promo.mp4'));
const URL = process.env.EDITOR_URL ?? 'http://localhost:9000/';

rmSync(outDir, { recursive: true, force: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text().slice(0, 300)));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Render'), { timeout: 30000 });

  // панель Video Settings открыта по умолчанию — ждём кнопку RENDER
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim().toUpperCase() === 'RENDER'), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().toUpperCase() === 'RENDER')?.click());
  console.log('render started');

  const started = Date.now();
  let last = '';
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await page.evaluate(() => {
      const t = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean);
      return t.find((x) => /^(RENDER|STOP|ABORT|CANCEL)/i.test(x ?? '')) ?? '';
    });
    const files = existsSync(outDir) ? readdirSync(outDir) : [];
    const line = `${Math.round((Date.now() - started) / 1000)}s button="${status}" files=${files.join(',')}`;
    if (line !== last) console.log(line);
    last = line;
    if (/^RENDER/i.test(status) && files.some((f) => f.endsWith('.mp4')) && Date.now() - started > 4000) break;
    if (Date.now() - started > 25 * 60_000) throw new Error('render timeout');
  }
  // метки звуковых событий, записанные сценами во время рендера (по ним строится аудиодорожка)
  const marks = await page.evaluate(() => window.__promoMarks ?? {});
  mkdirSync(resolve(root, 'audio'), { recursive: true });
  writeFileSync(resolve(root, 'audio/marks.json'), JSON.stringify(marks, null, 1));
  console.log('marks:', Object.keys(marks).length);
  const mp4 = resolve(outDir, readdirSync(outDir).find((f) => f.endsWith('.mp4')));
  mkdirSync(resolve(target, '..'), { recursive: true });
  copyFileSync(mp4, target);
  console.log('done:', target, Math.round(statSync(target).size / 1024), 'KB');
} finally {
  await browser.close();
}
