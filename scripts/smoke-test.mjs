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
page.setDefaultTimeout(180000); // software GL can take seconds per frame
const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning' && /THREE|deprecated|removed/i.test(m.text())) warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/?debug=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__JELLY__?.ready, null, { timeout: 30000 });
const state = () => page.evaluate(() => window.__JELLY__.state());
// fish must START in open water (not on the island sliding down)
const fishStart = await page.evaluate(() => {
  const J = window.__JELLY__;
  return J.fish.fish.map((f) => ({ y: f.pos.y, ground: J.islandHeight(f.pos.x, f.pos.z) }));
});
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };

await wait(800);
await page.screenshot({ path: `${out}/1-idle.png` });
const idle = await state();
check('idle sea is calm', idle.seaActivity < 0.0003, JSON.stringify(idle));
check('fish start in open water', fishStart.every((f) => f.y < -0.25 && f.ground < -0.5 && f.y > f.ground + 0.1),
  fishStart.filter((f) => !(f.y < -0.25 && f.ground < -0.5 && f.y > f.ground + 0.1)).length + ' misplaced');
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
  let peopleUnderIsland = false;
  J.island.mesh.traverse((o) => { if (o === J.people.group) peopleUnderIsland = true; });
  return { peopleUnderIsland, peopleParentIsScene: J.people.group.parent === J.scene, peopleCount: J.people.group.children.length };
});
check('people are not parented to the jiggling island', !structure.peopleUnderIsland && structure.peopleParentIsScene && structure.peopleCount > 0, JSON.stringify(structure));

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
// colour pickers: changing the sea colour recolours the ocean, reset restores it
const colours = await page.evaluate(() => {
  const J = window.__JELLY__, b = J.ocean.baseColor;           // the palette (colorAttr also has per-frame crest light)
  const i = J.ocean.depth.findIndex((d) => d > 1.5);            // a deep-water vertex
  const sample = () => [b[i * 3], b[i * 3 + 1], b[i * 3 + 2]].map((v) => +v.toFixed(3)).join(',');
  const before = sample();
  J.setColors({ sea: '#ff3366', sand: '#ffffff', grass: '#aa66ff', sky: '#ffd0e0' });
  const changed = sample();
  document.getElementById('col-reset').click();
  return { before, changed, after: sample(), skyVar: getComputedStyle(document.documentElement).getPropertyValue('--sky-mid').trim() };
});
check('colour pickers recolour the scene and reset restores it', colours.before !== colours.changed && colours.before === colours.after && colours.skyVar === '#cdeeff', JSON.stringify(colours));

// nothing in the diorama may cross the glass: every mesh outside the showcase group must fit the water box
const outside = await page.evaluate(() => {
  const J = window.__JELLY__, T = J.THREE, half = 5 + 0.02, bad = [];
  const showcase = J.scene.getObjectByName('showcase');
  J.scene.updateMatrixWorld(true);
  J.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p === showcase) return;
    const b = new T.Box3().setFromObject(o, true);
    if (b.min.x < -half || b.max.x > half || b.min.z < -half || b.max.z > half) bad.push(o.name || o.geometry.type);
  });
  return bad;
});
check('everything stays inside the glass case', outside.length === 0, outside.slice(0, 5).join(', '));

// the animation loop must survive odd clock values (negative time once froze the app on refresh)
const robust = await page.evaluate(() => {
  const J = window.__JELLY__;
  try { J.people.update(-0.4); J.people.update(-1.9); } catch (e) { return String(e); }
  return J.state().frameErrors === 0 ? 'ok' : 'frame errors: ' + J.state().frameErrors;
});
check('animation survives negative time, no frame errors', robust === 'ok', robust);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
check('no three.js deprecation warnings', warnings.length === 0, warnings.slice(0, 3).join(' | '));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
