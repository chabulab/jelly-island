#!/usr/bin/env node
/**
 * Reload stress test: refresh the page N times (fast, like an impatient user) and after each load check that
 * the app becomes ready and keeps animating (frame counter advances), with no errors or context loss.
 *
 *   npm run dev &   then   URL=http://localhost:5273 node scripts/reload-stress.mjs 15
 *   (env: URL default http://localhost:4273, CHROME_PATH / CHANNEL like smoke-test.mjs, HEADED=1 to watch)
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:4273';
const N = +(process.argv[2] ?? 10);
const browser = await chromium.launch({
  headless: !process.env.HEADED,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const log = [];
page.on('console', (m) => { if (m.type() === 'error' || /context lost|frame error/i.test(m.text())) log.push(m.text()); });
page.on('pageerror', (e) => log.push(String(e)));

let failures = 0;
for (let i = 1; i <= N; i++) {
  const t0 = Date.now();
  if (i === 1) await page.goto(URL); else await page.reload();
  await page.waitForFunction(() => window.__JELLY__?.ready === true);
  const tReady = Date.now() - t0;
  const f0 = await page.evaluate(() => window.__JELLY__.renderer.info.render.frame);
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({ frame: window.__JELLY__.renderer.info.render.frame, ...window.__JELLY__.state() }));
  const alive = s.frame > f0 && !s.contextLost && s.frameErrors === 0;
  if (!alive) failures++;
  console.log(`${alive ? 'OK  ' : 'FAIL'} load ${i}: ready in ${tReady} ms, frames +${s.frame - f0} in 1.5 s, contextLost=${s.contextLost}, frameErrors=${s.frameErrors}`);
  if (i < N) await page.waitForTimeout(Math.random() * 400); // refresh again soon, sometimes mid-startup
}
if (log.length) console.log('console:\n' + log.slice(0, 10).join('\n'));
await browser.close();
process.exit(failures ? 1 : 0);
