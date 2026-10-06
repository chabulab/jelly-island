#!/usr/bin/env node
/**
 * Headless smoke test. Starts nothing itself: run `npm run dev` or `npm run preview` first
 * (default URL http://localhost:4273, override with URL=...).
 *
 * Browser: uses system Chrome (playwright-core channel "chrome") unless CHROME_PATH is set.
 * Checks: page loads with no console errors, scene exposes window.__JELLY__, clicking the sea raises
 * wave activity and scares fish, orbiting excites the sea, activity decays, screenshots are written to smoke-output/.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:4273';
const out = 'smoke-output';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/?debug=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__JELLY__?.ready, null, { timeout: 30000 });
const state = () => page.evaluate(() => window.__JELLY__.state());
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

await wait(800);
await page.screenshot({ path: `${out}/1-idle.png` });
const idle = await state();
check('idle sea is calm', idle.seaActivity < 0.0003, JSON.stringify(idle));
check('fish relaxed at idle', idle.fishFear < 0.15, `fear=${idle.fishFear.toFixed(2)}`);

// Software GL renders slowly, so time-based checks use J.advance(seconds) (simulation without rendering).
const advance = (s) => page.evaluate((s) => window.__JELLY__.advance(s), s);

// click open water: project a known sea point (front-right of the case) to the screen and click it
const clicked = await page.evaluate(() => {
  const J = window.__JELLY__;
  const v = new J.THREE.Vector3(3.4, 0, 3.4).project(J.camera);
  const r = J.poke(((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight);
  return r ? r.kind : null;
});
check('click on open water hits the ocean', clicked === 'ocean', `kind=${clicked}`);
await advance(1.5);
const afterClick = await state();
await page.screenshot({ path: `${out}/2-after-click.png` });
check('click raises sea activity', afterClick.seaActivity > 0.001, `activity=${afterClick.seaActivity.toFixed(5)}`);
check('wave height stays sane (< 0.8)', afterClick.maxWave < 0.8, `max=${afterClick.maxWave.toFixed(2)}`);
check('click scares fish', afterClick.fishFear > 0.3, `fear=${afterClick.fishFear.toFixed(2)}`);

// island squashes and palms bend on a poke; people are a separate group that never reads the jelly state
await page.evaluate(() => { const J = window.__JELLY__; J.pokeWorld(0, 0.5, 0, 'island'); J.pokeWorld(-1.7, 1.5, -0.8, 'palm', 1); });
await advance(0.25);
const isl = await state();
check('island squash responds to poke', Math.abs(isl.islandSquash) > 0.005, `squash=${isl.islandSquash.toFixed(3)}`);
check('palms bend after poke', isl.palmBend.some((b) => b > 0.01), isl.palmBend.map((b) => b.toFixed(3)).join(','));
const structure = await page.evaluate(() => {
  const J = window.__JELLY__;
  return { islandHasChildren: J.island.mesh.children.length, peopleParentIsScene: J.people.group.parent === J.scene, peopleCount: J.people.group.children.length };
});
check('people are not parented to the jiggling island', structure.islandHasChildren === 0 && structure.peopleParentIsScene && structure.peopleCount > 0, JSON.stringify(structure));

await advance(14);
const calm = await state();
check('sea settles again (jelly decays)', calm.seaActivity < afterClick.seaActivity * 0.5, `activity=${calm.seaActivity.toFixed(5)}`);
check('fish calm down again', calm.fishFear < afterClick.fishFear, `fear=${calm.fishFear.toFixed(2)}`);

// orbit with the mouse
await page.mouse.move(400, 400);
await page.mouse.down();
for (let i = 0; i < 25; i++) { await page.mouse.move(400 + i * 18, 400 + i * 2); await wait(16); }
const rot = await state();
await page.screenshot({ path: `${out}/3-orbiting.png` });
await page.mouse.up();
check('orbiting registers as rotation', rot.rotationSpeed > 0.3, `rot=${rot.rotationSpeed.toFixed(2)}`);

await wait(1000);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
