import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CASE } from '../config.js';
import { plaqueTexture, streakTexture, woodTexture, blobShadowTexture } from '../fx/textures.js';
import { bake } from '../util/bake.js';

/**
 * The museum-style display case: two-tier lacquered wood pedestal, brass trim and frame with corner finials,
 * glass panes with fake reflections, brass-screwed plaques, and the "water box" walls (the sea's side faces).
 * The sea surface itself lives in ocean.js; the island in island.js.
 */
export function createShowcase() {
  const g = new THREE.Group();
  g.name = 'showcase';
  const H = CASE.half;
  const pad = 0.25;                      // glass sits slightly outside the water
  const gh = H + pad;
  const yBot = CASE.floorY - 0.1;
  const yTop = CASE.topY;
  const height = yTop - yBot;
  const add = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; g.add(m); return m; };
  const rbox = (w, h, d, r = 0.05, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

  // --- materials ---------------------------------------------------------------
  const woodMap = woodTexture();
  const wood = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: woodMap, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const woodDark = new THREE.MeshPhysicalMaterial({ color: 0x8a7a70, map: woodMap, roughness: 0.5, clearcoat: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8aa58, roughness: 0.26, metalness: 0.92 });

  // --- pedestal ------------------------------------------------------------------
  const W = gh * 2 + 1.0;
  add(new THREE.Mesh(rbox(W, 1.3, W, 0.08), wood)).position.y = yBot - 0.75;              // body
  add(new THREE.Mesh(rbox(W + 0.5, 0.32, W + 0.5, 0.1), woodDark)).position.y = yBot - 1.44; // plinth
  add(new THREE.Mesh(rbox(W + 0.25, 0.12, W + 0.25, 0.05), brass)).position.y = yBot - 1.24;  // lower brass band
  add(new THREE.Mesh(rbox(W + 0.06, 0.1, W + 0.06, 0.04), brass)).position.y = yBot - 0.08;              // top brass band
  // deck inside the glass, flush with the seabed: same lacquered wood as the body
  add(new THREE.Mesh(rbox(gh * 2 + 0.4, 0.14, gh * 2 + 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x4a2f1e, roughness: 0.5 }))).position.y = CASE.floorY - 0.09; // top 2 cm under the seabed (no z-fighting)

  // plaque on every side so it reads while orbiting, with 4 brass screws each
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.45, metalness: 0.2 });
  const plaqueGeo = rbox(4.6, 0.58, 0.04, 0.015, 2);
  const screwGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2);
  const off = W / 2 + 0.02;
  [[0, off, 0], [off, 0, Math.PI / 2], [0, -off, Math.PI], [-off, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
    const p = new THREE.Group();
    p.position.set(x, yBot - 0.75, z);
    p.rotation.y = ry;
    p.add(new THREE.Mesh(plaqueGeo, plaqueMat));
    for (const sx of [-2.18, 2.18]) for (const sy of [-0.19, 0.19]) {
      const s = new THREE.Mesh(screwGeo, brass); s.position.set(sx, sy, 0.025); p.add(s);
    }
    g.add(p);
  });

  // --- water box walls (the side faces of the sea), a hair outside the island's cut-away sides ----------
  const waterMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, transparent: true, opacity: 1, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  });
  const wallH = CASE.waterY - CASE.floorY;
  const wallGeo = new THREE.PlaneGeometry(H * 2 + 0.024, wallH, 1, 8);
  { // light, clear turquoise at the surface -> denser deep blue at the bottom (RGBA vertex colours): reads as depth
    const p = wallGeo.attributes.position, col = new Float32Array(p.count * 4), c = new THREE.Color();
    const top = new THREE.Color(0x3cc0dc), bottom = new THREE.Color(0x0a5a96);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / wallH + 0.5; // 0 bottom .. 1 top
      c.copy(bottom).lerp(top, t);
      col.set([c.r, c.g, c.b, 0.62 - 0.36 * t], i * 4);
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const wo = H + 0.012;
  [[0, wo, 0], [wo, 0, Math.PI / 2], [0, -wo, Math.PI], [-wo, 0, -Math.PI / 2]].forEach(([cx, cz, ry]) => {
    const wall = new THREE.Mesh(wallGeo, waterMat);
    wall.position.set(cx, CASE.floorY + wallH / 2, cz);
    wall.rotation.y = ry;
    wall.renderOrder = 1;
    g.add(wall);
  });

  // --- glass ---------------------------------------------------------------------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf8ff, transparent: true, opacity: 0.08, roughness: 0.03, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6,
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(gh * 2, height, gh * 2), glassMat);
  glass.position.y = yBot + height / 2;
  glass.renderOrder = 3;
  g.add(glass);

  // fake window reflections
  const streakMat = new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const streakGeo = new THREE.PlaneGeometry(gh * 2, height);
  [[0, gh + 0.01, 0], [gh + 0.01, 0, Math.PI / 2], [0, -gh - 0.01, Math.PI], [-gh - 0.01, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
    const s = new THREE.Mesh(streakGeo, streakMat);
    s.position.set(x, yBot + height / 2, z);
    s.rotation.y = ry;
    s.renderOrder = 4;
    g.add(s);
  });

  // --- brass frame with corner finials -------------------------------------------------------
  const t = 0.13;
  const frame = new THREE.Group();
  g.add(frame);
  const bar = (w, h, d, x, y, z) => { const m = new THREE.Mesh(rbox(w, h, d, 0.03, 2), brass); m.position.set(x, y, z); frame.add(m); };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bar(t, height, t, sx * gh, yBot + height / 2, sz * gh); // posts
    const fin = new THREE.Group();
    fin.position.set(sx * gh, yTop + t / 2, sz * gh);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.08, 16), brass); neck.position.y = 0.04;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), brass); ball.position.y = 0.15;
    fin.add(neck, ball);
    frame.add(fin);
  }
  for (const y of [yBot + 0.1, yTop]) {
    for (const s of [-1, 1]) {
      bar(gh * 2 + t, t, t, 0, y, s * gh);
      bar(t, t, gh * 2 + t, s * gh, y, 0);
    }
  }

  bake(frame, { material: brass, receiveShadow: false, name: 'brass-frame' });

  // --- floor: real shadow + soft contact shadow -----------------------------------------------
  const floorY = yBot - 1.6;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  g.add(floor);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.9, W * 1.9),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = floorY + 0.005;
  g.add(blob);

  return g;
}
