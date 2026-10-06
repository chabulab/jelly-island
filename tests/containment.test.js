import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CASE } from '../src/config.js';
import { Props } from '../src/world/props.js';
import { Palms } from '../src/world/palms.js';

// Fake JellyState: props/palms only read these fields at build time.
const jelly = { strength: 1, sx: { x: 0 }, sz: { x: 0 }, onImpulse() {} };
const TOL = 0.005;

/** Every mesh's world-space bounding box must stay inside the water box (x, z in [-half, half]). */
function outsiders(root) {
  root.updateMatrixWorld(true);
  const bad = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o, true);
    if (b.min.x < -CASE.half - TOL || b.max.x > CASE.half + TOL || b.min.z < -CASE.half - TOL || b.max.z > CASE.half + TOL) {
      bad.push(`${o.name || o.geometry.type} x[${b.min.x.toFixed(2)}, ${b.max.x.toFixed(2)}] z[${b.min.z.toFixed(2)}, ${b.max.z.toFixed(2)}]`);
    }
  });
  return bad;
}

test('props stay inside the glass case', () => {
  const props = new Props(jelly);
  const bad = outsiders(props.group);
  assert.deepEqual(bad, [], 'outside the case:\n' + bad.join('\n'));
});

test('palms stay inside the glass case', () => {
  const palms = new Palms(jelly);
  const bad = outsiders(palms.group);
  assert.deepEqual(bad, [], 'outside the case:\n' + bad.join('\n'));
});
