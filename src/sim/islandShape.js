import { CASE } from '../config.js';

/**
 * Analytic island height field. Pure function of (x, z) so the island mesh, the ocean
 * (shore / solid mask), the fish (collision) and the people/palm placement all agree.
 *
 * Shape: a round dome whose top is flattened into a plateau (~y 0.5) with gentle noise.
 * Slopes dive to the seabed (CASE.floorY) at the case walls.
 */
const R = 5.6;
const PLATEAU = 0.45;

function bump(x, z) {
  return Math.sin(x * 1.7 + 0.6) * Math.cos(z * 1.3 - 0.4) * 0.5 + Math.sin(x * 3.1 - z * 2.3) * 0.25;
}

export function islandHeight(x, z) {
  const r = Math.hypot(x * 0.95, z * 1.05);
  const g = Math.max(0, 1 - (r / R) ** 2);
  let h = CASE.floorY + 3.4 * Math.pow(g, 0.8) + bump(x, z) * 0.12 * Math.min(1, g * 3);
  if (h > PLATEAU) h = PLATEAU + (h - PLATEAU) * 0.25; // flatten the top
  // wave-made sand ripples on the underwater slopes (fade out toward the beach and the seabed floor)
  const under = Math.min(1, Math.max(0, (-0.35 - h) / 0.5)) * Math.min(1, Math.max(0, (h - CASE.floorY) / 0.3));
  if (under > 0) h += under * 0.022 * Math.sin(x * 5.3 + z * 2.1 + Math.sin(z * 1.7) * 1.4);
  return Math.max(h, CASE.floorY);
}

/** Horizontal gradient by central differences (used by fish to steer around the island). */
export function islandGradient(x, z, out = [0, 0], e = 0.08) {
  out[0] = (islandHeight(x + e, z) - islandHeight(x - e, z)) / (2 * e);
  out[1] = (islandHeight(x, z + e) - islandHeight(x, z - e)) / (2 * e);
  return out;
}

/** Where on the island things live. Keeps layout in one place. */
export const LAYOUT = {
  grassCentre: [0, -0.9],  // grass blob centre (x, z)
  grassRadius: 1.9,
  court: { cx: 0, cz: 1.3, halfX: 1.15, halfZ: 0.6 },      // net runs along z at x = cx
  palms: [
    { x: -1.7, z: -0.8, h: 2.5, lean: 0.28, dir: [-0.6, 0.8] },
    { x: -0.9, z: -1.75, h: 2.9, lean: 0.2, dir: [0.2, -1] },
    { x: 1.5, z: -1.25, h: 2.7, lean: 0.3, dir: [0.9, -0.3] },
    { x: 2.05, z: -0.35, h: 2.2, lean: 0.34, dir: [1, 0.4] },
    { x: 0.25, z: -0.55, h: 2.35, lean: 0.18, dir: [-0.3, 0.9] },
  ],
  towels: [
    { x: -1.65, z: 0.3, rot: 0.45 },
    { x: 1.7, z: 0.75, rot: -0.35 },
  ],
  umbrella: { x: -1.65, z: 0.3 },
};
