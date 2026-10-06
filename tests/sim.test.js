import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveGrid } from '../src/sim/waveGrid.js';
import { Spring } from '../src/sim/spring.js';
import { islandHeight } from '../src/sim/islandShape.js';
import { CASE, FEAR, WAVE } from '../src/config.js';

test('spring settles to zero', () => {
  const s = new Spring(60, 3, 1, 0);
  for (let i = 0; i < 600; i++) s.step(1 / 60);
  assert.ok(Math.abs(s.x) < 1e-3);
});

test('island: dry plateau in the middle, seabed at the walls', () => {
  assert.ok(islandHeight(0, 0) > 0.3 && islandHeight(0, 0) < 0.9);
  assert.ok(islandHeight(4.9, 4.9) <= CASE.floorY + 0.01);
  assert.ok(islandHeight(-1.65, 0.3) > 0.2, 'towel spot is above water');
});

test('ripple raises activity, then it decays (calm again) but takes a while (jelly)', () => {
  const g = new WaveGrid(WAVE.cells, 10, (x, z) => islandHeight(x, z) > WAVE.solidHeight);
  assert.ok(g.activity < 1e-6);
  g.ripple(3, 3);
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  let peak = 0; for (let i = 0; i < 90; i++) { g.update(1 / 60); peak = Math.max(peak, g.activity); }
  assert.ok(peak > FEAR.panic, `click should scare fish: activity ${peak} vs panic ${FEAR.panic}`);
  assert.ok(g.maxAbsHeight() < 0.8, 'no explosive heights');
  for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
  assert.ok(g.activity < peak * 0.8, 'decays');
  for (let i = 0; i < 60 * 40; i++) g.update(1 / 60);
  assert.ok(g.activity < FEAR.calm, `calms down eventually: ${g.activity}`);
});

test('solid cells stay pinned', () => {
  const g = new WaveGrid(WAVE.cells, 10, (x, z) => islandHeight(x, z) > WAVE.solidHeight);
  g.ripple(2.5, 2.5);
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  const i = g.index(0, 0);
  assert.equal(g.h[i], 0);
});
