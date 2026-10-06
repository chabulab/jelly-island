#!/usr/bin/env node
/**
 * Performance probe (docs/VISUAL-QA.md#performance): mesh / shadow-caster / triangle counts, draw calls,
 * CPU time per subsystem update, and GPU render time with each scene group hidden in turn.
 *
 *   npm run preview &  then  node scripts/perf-probe.mjs      (env: URL, CHROME_PATH / CHANNEL)
 *
 * Read absolute ms with care on software GL; compare the *relative* numbers (which group costs most).
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:4273';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.CHANNEL ? { channel: process.env.CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(240000);
await page.goto(URL);
await page.waitForFunction(() => window.__JELLY__?.ready);
await page.waitForTimeout(2000);

const report = await page.evaluate(() => {
  const J = window.__JELLY__;
  const R = J.renderer, gl = R.getContext(), px = new Uint8Array(4);
  // scene census
  let meshes = 0, shadowCasters = 0, triangles = 0;
  J.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++; if (o.castShadow) shadowCasters++;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    triangles += n * (o.isInstancedMesh ? o.count : 1);
  });
  // CPU per subsystem (avg of 5 calls)
  const cpu = {};
  const time = (k, f) => { const t = performance.now(); for (let i = 0; i < 5; i++) f(); cpu[k] = +((performance.now() - t) / 5).toFixed(2); };
  time('ocean', () => J.ocean.update(1 / 60, 1));
  time('island', () => J.island.update(1 / 60));
  time('palms', () => J.palms.update(1 / 60, 1));
  time('people', () => J.people.update(1));
  time('fish', () => J.fish.update(1 / 60, 1));
  time('props', () => J.props.update(1 / 60, 1));
  // GPU: render + readPixels forces completion; warm-up render first
  const render = () => { R.render(J.scene, J.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = performance.now(); R.render(J.scene, J.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return +(performance.now() - t).toFixed(0); };
  const gpu = { all: render() };
  const drawCalls = R.info.render.calls; // full scene incl. the shadow-map pass
  for (const name of ['showcase', 'island', 'ocean', 'palms', 'people', 'fish', 'props']) {
    const o = J.scene.getObjectByName(name); if (!o) continue;
    o.visible = false; gpu['without ' + name] = render(); o.visible = true;
  }
  return { meshes, shadowCasters, triangles: Math.round(triangles), drawCalls, cpuMs: cpu, gpuMs: gpu };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
