import * as THREE from 'three';
import { CASE } from '../config.js';
import { plaqueTexture, streakTexture } from '../fx/textures.js';

/**
 * The museum-style display case: wooden pedestal, brass frame, glass panes, plaque, and the
 * "water box" walls. The sea surface itself lives in ocean.js; the island in island.js.
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

  // --- pedestal -------------------------------------------------------------
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.55, metalness: 0.05 });
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(gh * 2 + 1.0, 1.6, gh * 2 + 1.0), wood);
  pedestal.position.y = yBot - 0.8;
  pedestal.castShadow = pedestal.receiveShadow = true;
  g.add(pedestal);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(gh * 2 + 1.3, 0.16, gh * 2 + 1.3),
    new THREE.MeshStandardMaterial({ color: 0xc89b4a, roughness: 0.3, metalness: 0.85 })
  );
  trim.position.y = yBot + 0.04;
  trim.castShadow = true;
  g.add(trim);

  // plaque on every side so it reads while orbiting
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.5, metalness: 0.2 });
  const plaqueGeo = new THREE.PlaneGeometry(4.6, 0.575);
  const off = gh + 0.5 + 0.005;
  [[0, 0, off, 0], [off, 0, 0, Math.PI / 2], [0, 0, -off, Math.PI], [-off, 0, 0, -Math.PI / 2]].forEach(([x, , z, ry]) => {
    const p = new THREE.Mesh(plaqueGeo, plaqueMat);
    p.position.set(x, yBot - 0.8, z);
    p.rotation.y = ry;
    g.add(p);
  });

  // --- water box walls (the side faces of the sea) -------------------------------
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1f9fcb, transparent: true, opacity: 0.55, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false,
  });
  const wallH = CASE.waterY - CASE.floorY;
  const wallGeo = new THREE.PlaneGeometry(H * 2, wallH);
  [[0, H, 0], [H, 0, Math.PI / 2], [0, -H, Math.PI], [-H, 0, -Math.PI / 2]].forEach(([cx, cz, ry]) => {
    const wall = new THREE.Mesh(wallGeo, waterMat);
    wall.position.set(cx, CASE.floorY + wallH / 2, cz);
    wall.rotation.y = ry;
    wall.renderOrder = 1;
    g.add(wall);
  });

  // --- glass --------------------------------------------------------------
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf8ff, transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6,
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(gh * 2, height, gh * 2), glassMat);
  glass.position.y = yBot + height / 2;
  glass.renderOrder = 3;
  g.add(glass);

  // fake window reflections
  const streakMat = new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const streakGeo = new THREE.PlaneGeometry(gh * 2, height);
  [[0, gh + 0.01, 0], [gh + 0.01, 0, Math.PI / 2], [0, -gh - 0.01, Math.PI], [-gh - 0.01, 0, -Math.PI / 2]].forEach(([a, b, ry]) => {
    const s = new THREE.Mesh(streakGeo, streakMat);
    s.position.set(ry === 0 || ry === Math.PI ? 0 : a, yBot + height / 2, ry === 0 || ry === Math.PI ? b : 0);
    s.rotation.y = ry;
    s.renderOrder = 4;
    g.add(s);
  });

  // --- brass frame ----------------------------------------------------------
  const brass = new THREE.MeshStandardMaterial({ color: 0xd1a24f, roughness: 0.28, metalness: 0.9 });
  const t = 0.12;
  const bar = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), brass);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t, height, t, sx * gh, yBot + height / 2, sz * gh); // posts
  for (const y of [yBot, yTop]) {
    for (const s of [-1, 1]) {
      bar(gh * 2 + t, t, t, 0, y, s * gh);
      bar(t, t, gh * 2 + t, s * gh, y, 0);
    }
  }
  // --- soft floor that catches the shadow -------------------------------------------
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = yBot - 1.6;
  floor.receiveShadow = true;
  g.add(floor);

  return g;
}
