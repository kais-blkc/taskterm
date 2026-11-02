import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--window-size=1920,1080'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:9000/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: out });
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll('button, [role=tab], a')].map((b) => (b.textContent || b.getAttribute('title') || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 60),
);
console.log(JSON.stringify(buttons));
await browser.close();
