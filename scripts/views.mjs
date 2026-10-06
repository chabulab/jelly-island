#!/usr/bin/env node
/**
 * Visual QA: render the scene from a fixed set of named cameras and save PNGs (docs/VISUAL-QA.md).
 *
 *   npm run preview &                       # or npm run dev (then URL=http://localhost:5273)
 *   node scripts/views.mjs                  # all views -> qa-output/<view>.png
 *   node scripts/views.mjs side,beach       # only some views
 *   PREFIX=before node scripts/views.mjs    # qa-output/before-<view>.png (compare before/after)
 *
 * Env: URL (default http://localhost:4273), CHROME_PATH or CHANNEL (see smoke-test.mjs), WIDTH/HEIGHT.
 * Software GL is slow (seconds per frame): timeouts are generous; run in the background if needed.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/** Named cameras: [camera position, orbit target]. Each one exists to catch a specific class of problem. */
export const VIEWS = {
  default: [[9.6, 6.0, 11.4], [0, 0.4, 0]],    // first impression: composition, overall colour balance
  side:    [[13.5, 0.2, 4.5], [0, -1.0, 0]],   // through the water walls: hollow/open geometry, cross-section, z-fighting
  corner:  [[8.5, 1.2, 8.5], [2.5, -1.2, 2.5]],// glass corners + seabed: z-fighting with the deck, gaps at the walls
  under:   [[6, -0.6, 7], [1, -1.3, 1]],       // underwater: fish markings, corals, seaweed, depth tint readability
  beach:   [[3.2, 1.6, 4.6], [0, 0.5, 0.6]],   // mid-range: people, court, props scale relative to each other
  people:  [[0.9, 0.95, 2.35], [0, 0.62, 1.35]], // close-up: faces, hands/feet, pose plausibility
  sunbath: [[1.75, 1.05, 1.45], [1.7, 0.5, 0.75]], // close-up lying pose: accessories that only work upright
  palms:   [[-4.5, 2.6, -1.5], [-0.6, 1.2, -1.0]], // trunks, fronds, grass, bushes; also ocean colour artefacts
  top:     [[0.5, 13, 2], [0, 0, 0]],          // layout from above: overlaps, things floating or buried
};

const URL = process.env.URL ?? 'http://localhost:4273';
const prefix = process.env.PREFIX ? process.env.PREFIX + '-' : '';
const only = process.argv[2]?.split(',');
const out = 'qa-output';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +(process.env.WIDTH ?? 1280), height: +(process.env.HEIGHT ?? 800) } });
page.setDefaultTimeout(240000);
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /THREE/.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(String(e)));

await page.goto(URL);
await page.waitForFunction(() => window.__JELLY__?.ready);
await page.evaluate(() => { document.querySelector('.hint')?.classList.add('hide'); window.__JELLY__.advance(2.5); });

for (const [name, [pos, target]] of Object.entries(VIEWS)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([pos, target]) => {
    const J = window.__JELLY__;
    J.controls.minDistance = 0.5; // QA cameras may go closer than users can
    J.controls.target.set(...target);
    J.camera.position.set(...pos);
    J.controls.update();
    J.advance(0.3);
  }, [pos, target]);
  await page.waitForTimeout(700);
  const file = `${out}/${prefix}${name}.png`;
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'console: clean');
await browser.close();
process.exit(problems.length ? 1 : 0);
