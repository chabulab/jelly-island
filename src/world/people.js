import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';
import { stripeTexture, netTexture, ballTexture } from '../fx/textures.js';
import { bake } from '../util/bake.js';

/**
 * Beach life. IMPORTANT: nothing here reads JellyState - people are deliberately immune to the jelly wobble.
 * (They are also not children of the island mesh, which is what jiggles.)
 * Figures are ~0.5 units tall (palms are 2.2-2.9, so ~1:5, like real life). Toy-like but with real
 * proportions: two-part arms and legs (elbows/knees), hands, feet, neck, ears, eyes, several hair styles.
 */
const mats = {};
const mat = (hex, rough = 0.7) => (mats[hex + ':' + rough] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
const SKIN = [0xf1c6a0, 0xc68a5e, 0x8d5a3b, 0xe8b48a];

const GEO = {
  thigh: new THREE.CapsuleGeometry(0.021, 0.07, 4, 10),
  shin: new THREE.CapsuleGeometry(0.017, 0.08, 4, 10),
  foot: new RoundedBoxGeometry(0.032, 0.018, 0.064, 2, 0.008),
  upper: new THREE.CapsuleGeometry(0.0145, 0.06, 4, 8),
  fore: new THREE.CapsuleGeometry(0.0125, 0.058, 4, 8),
  hand: new THREE.SphereGeometry(0.016, 10, 8).scale(0.85, 1.1, 0.7),
  head: new THREE.SphereGeometry(0.042, 20, 16).scale(0.95, 1.05, 1),
  eye: new THREE.SphereGeometry(0.0058, 8, 6),
  ear: new THREE.SphereGeometry(0.009, 8, 6).scale(0.6, 1, 1),
  nose: new THREE.SphereGeometry(0.0065, 8, 6),
  neck: new THREE.CylinderGeometry(0.0145, 0.016, 0.035, 10),
  pelvis: new THREE.CylinderGeometry(0.045, 0.049, 0.07, 16),
  shortLeg: new THREE.CylinderGeometry(0.026, 0.028, 0.05, 12),
  hairCap: new THREE.SphereGeometry(0.0455, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
  torso: (() => {
    // waist -> ribcage -> chest -> shoulders, then flattened front-to-back
    const prof = [[0.0, 0.0], [0.04, 0.0], [0.041, 0.03], [0.047, 0.08], [0.05, 0.115], [0.044, 0.14], [0.025, 0.155], [0.0, 0.158]];
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(1, 1, 0.7);
  })(),
};

/**
 * Person facing +z, origin at the feet. Pivots for posing: legs[] (hips), knees[], arms[] (shoulders), elbows[].
 * @param {{skin:number, top:number|'skin', bottom:number, hair:number, hairStyle?:'short'|'long'|'pony'|'bun'|'curly',
 *          hat?:'sun'|'cap'|null, hatColor?:number, glasses?:boolean, scale?:number}} o
 */
function makePerson(o) {
  const g = new THREE.Group();
  const s = mat(o.skin, 0.55);
  const topMat = o.top === 'skin' ? s : mat(o.top, 0.6);
  const botMat = mat(o.bottom, 0.6);
  const hairMat = mat(o.hair, 0.85);
  const M = (geo, m, x = 0, y = 0, z = 0, parent) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };

  const hips = new THREE.Group(); hips.position.y = 0.215; g.add(hips);
  M(GEO.pelvis, botMat, 0, 0.012, 0, hips).scale.set(1, 1, 0.75);

  const legs = [], knees = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.024, 0, 0); hips.add(leg);
    M(GEO.thigh, s, 0, -0.0525, 0, leg);
    if (o.shorts !== false) M(GEO.shortLeg, botMat, 0, -0.022, 0, leg);
    const knee = new THREE.Group(); knee.position.y = -0.105; leg.add(knee);
    M(GEO.shin, s, 0, -0.05, 0, knee);
    M(GEO.foot, s, 0, -0.1, 0.014, knee);
    legs.push(leg); knees.push(knee);
  }

  const torso = M(GEO.torso, topMat, 0, 0.035, 0, hips);
  M(GEO.neck, s, 0, 0.2, 0, hips);

  const arms = [], elbows = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.058, 0.172, 0); arm.rotation.z = sx * 0.1; hips.add(arm);
    M(GEO.upper, s, 0, -0.042, 0, arm);
    const elbow = new THREE.Group(); elbow.position.y = -0.085; arm.add(elbow);
    M(GEO.fore, s, 0, -0.04, 0, elbow);
    M(GEO.hand, s, 0, -0.088, 0, elbow);
    arms.push(arm); elbows.push(elbow);
  }

  // head
  const head = new THREE.Group(); head.position.y = 0.245; hips.add(head);
  M(GEO.head, s, 0, 0, 0, head);
  for (const sx of [-1, 1]) {
    M(GEO.eye, mat(0x1d1d1d, 0.3), sx * 0.015, 0.006, 0.038, head);
    M(GEO.ear, s, sx * 0.041, 0, -0.002, head);
  }
  M(GEO.nose, s, 0, -0.004, 0.043, head);
  const cap = M(GEO.hairCap, hairMat, 0, 0.004, -0.003, head); cap.rotation.x = -0.32;
  switch (o.hairStyle ?? 'short') {
    case 'long': { const back = M(new THREE.CapsuleGeometry(0.036, 0.06, 4, 10), hairMat, 0, -0.035, -0.022, head); back.scale.z = 0.55; break; }
    case 'pony': { const tail = M(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8), hairMat, 0, -0.01, -0.06, head); tail.rotation.x = 0.6; break; }
    case 'bun': M(new THREE.SphereGeometry(0.022, 12, 10), hairMat, 0, 0.03, -0.04, head); break;
    case 'curly': for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; M(new THREE.SphereGeometry(0.017, 8, 6), hairMat, Math.cos(a) * 0.034, 0.028 + (k % 2) * 0.01, Math.sin(a) * 0.03 - 0.008, head); } break;
    default: break;
  }
  if (o.glasses) {
    const gm = mat(0x111111, 0.15);
    for (const sx of [-1, 1]) M(new THREE.SphereGeometry(0.0135, 12, 8).scale(1.15, 0.85, 0.35), gm, sx * 0.016, 0.006, 0.041, head);
    M(new THREE.BoxGeometry(0.012, 0.003, 0.003), gm, 0, 0.009, 0.044, head);
  }
  if (o.hat === 'sun') {
    const hm = mat(o.hatColor ?? 0xf4e3a1, 0.8);
    M(new THREE.CylinderGeometry(0.09, 0.095, 0.005, 28), hm, 0, 0.028, 0, head);
    M(new THREE.SphereGeometry(0.046, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.028, 0, head);
    M(new THREE.CylinderGeometry(0.047, 0.047, 0.01, 18), mat(0xff5d5d, 0.6), 0, 0.034, 0, head);
  } else if (o.hat === 'cap') {
    const hm = mat(o.hatColor ?? 0xffffff, 0.6);
    M(new THREE.SphereGeometry(0.047, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.012, 0, head);
    const visor = M(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 16, 1, false, -Math.PI / 2, Math.PI), hm, 0, 0.014, 0.035, head);
    visor.scale.z = 1.3;
  }
  g.scale.setScalar(o.scale ?? 1);
  // merge the static parts of each rig segment (fewer draw calls); pivots keep animating
  const body = bake(hips, { deep: false, name: 'body' }) ?? torso;
  for (const part of [...legs, ...knees, ...arms, ...elbows]) bake(part, { deep: false });
  const headMesh = bake(head, { deep: false, name: 'head' });
  if (headMesh) headMesh.castShadow = true;
  return { group: g, hips, torso: body, legs, knees, arms, elbows, head };
}

function place(obj, x, z, lift = 0) { obj.position.set(x, islandHeight(x, z) + lift, z); }

/** Towel with rolled ends and stripes. */
function towel(colors) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: stripeTexture(colors, 8, [1, 1]), roughness: 0.95 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.012, 0.64, 2, 0.005), m);
  body.position.y = 0.006; body.receiveShadow = true; g.add(body);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 14).rotateZ(Math.PI / 2), m);
  roll.position.set(0, 0.02, -0.33); roll.castShadow = true; g.add(roll); // pillow roll at the head end
  return g;
}

/** Beach umbrella: scalloped 8-panel canopy (alternating colours), ribs, finial, two-tone pole. */
function umbrella() {
  const g = new THREE.Group();
  const R = 0.36, Hc = 0.13, P = 8, sub = 6;
  const pos = [], col = [], idx = [];
  const ca = new THREE.Color(0xff5d5d), cb = new THREE.Color(0xffffff);
  for (let p = 0; p < P; p++) {
    const c = p % 2 ? cb : ca;
    const base = pos.length / 3;
    pos.push(0, Hc, 0); col.push(c.r, c.g, c.b);
    for (let k = 0; k <= sub; k++) {
      const u = k / sub, a = ((p + u) / P) * Math.PI * 2;
      const scallop = Math.sin(u * Math.PI);
      const rr = R * (1 - 0.06 * scallop);
      // mid ring (slight dome) and rim
      pos.push(Math.cos(a) * rr * 0.55, Hc * 0.55 + 0.02, Math.sin(a) * rr * 0.55); col.push(c.r, c.g, c.b);
      pos.push(Math.cos(a) * rr, 0.012 * scallop, Math.sin(a) * rr); col.push(c.r, c.g, c.b);
    }
    for (let k = 0; k < sub; k++) {
      const m0 = base + 1 + k * 2, r0 = m0 + 1, m1 = m0 + 2, r1 = m0 + 3;
      idx.push(base, m1, m0, m0, m1, r0, r0, m1, r1);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  cg.setIndex(idx); cg.computeVertexNormals();
  const canopy = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 }));
  canopy.position.y = 0.6; canopy.castShadow = true; g.add(canopy);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mat(0xffffff, 0.3)); fin.position.y = 0.6 + Hc + 0.01; g.add(fin);
  for (let p = 0; p < P; p++) { // ribs under the canopy
    const a = (p / P) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.3, 4), mat(0x777777, 0.4));
    rib.position.set(Math.cos(a) * 0.15, 0.6 + Hc * 0.42, Math.sin(a) * 0.15);
    rib.rotation.set(0, -a, 0); rib.rotateZ(Math.PI / 2 - 0.42);
    g.add(rib);
  }
  const poleLo = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 8), mat(0xf2f2f2, 0.4)); poleLo.position.y = 0.16;
  const poleHi = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), mat(0xff5d5d, 0.4)); poleHi.position.y = 0.46;
  poleLo.castShadow = poleHi.castShadow = true;
  g.add(poleLo, poleHi);
  bake(g, { name: 'umbrella' });
  return g;
}

export function createPeople() {
  const root = new THREE.Group();
  root.name = 'people';
  const actors = [];   // things with update(t)

  // ---------------- sunbathers ----------------
  const towelColors = [['#ff6b6b', '#ffffff'], ['#39a0ed', '#ffe066']];
  const outfits = [
    { skin: SKIN[0], top: 0xff5d8f, bottom: 0xff5d8f, hair: 0x5a3416, hairStyle: 'long', glasses: true, shorts: false },
    { skin: SKIN[2], top: 'skin', bottom: 0x2a9d8f, hair: 0x15110d, hairStyle: 'curly', glasses: true },
  ];
  LAYOUT.towels.forEach((tw, i) => {
    const wrap = new THREE.Group();
    place(wrap, tw.x, tw.z, 0.006);
    wrap.rotation.y = tw.rot;
    wrap.add(towel(towelColors[i]));

    const p = makePerson(outfits[i]);
    p.group.rotation.x = -Math.PI / 2;           // lie on the back, head toward -z
    p.group.position.set(0, 0.04, 0.25);
    if (i === 0) {                                // one knee up, arms relaxed
      p.legs[1].rotation.x = -0.75; p.knees[1].rotation.x = 1.45;
      p.arms[0].rotation.set(0, 0, 0.25); p.arms[1].rotation.set(0, 0, -0.25);
    } else {                                      // hands behind the head, ankles crossed
      for (const k of [0, 1]) { p.arms[k].rotation.set(-2.75, 0, k ? -0.55 : 0.55); p.elbows[k].rotation.set(-2.1, 0, 0); }
      p.legs[0].rotation.z = 0.06; p.legs[1].rotation.z = -0.1;
      p.head.rotation.x = 0.25;
    }
    wrap.add(p.group);
    if (i === 1) { // his sun hat lies on the sand next to the towel
      const hm = mat(0xf4e3a1, 0.8);
      const hat = new THREE.Group();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.005, 28), hm);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.046, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hm);
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 18), mat(0xff5d5d, 0.6)); ribbon.position.y = 0.006;
      hat.add(brim, dome, ribbon);
      hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      hat.position.set(0.27, 0.0, -0.22);
      hat.rotation.set(0.08, 0, -0.06);
      wrap.add(hat);
    }
    root.add(wrap);
    actors.push({ update: (t) => { const b = Math.sin(t * 1.4 + i); p.torso.scale.set(1, 1 + b * 0.012, 1 + b * 0.035); } }); // breathing
  });

  const um = umbrella();
  place(um, LAYOUT.umbrella.x + 0.14, LAYOUT.umbrella.z - 0.32);
  um.rotation.z = -0.16; um.rotation.y = 0.4;
  root.add(um);

  // ---------------- beach volleyball ----------------
  const { cx, cz, halfX, halfZ } = LAYOUT.court;
  const court = new THREE.Group();
  place(court, cx, cz, 0.004);
  const courtStatic = new THREE.Group();
  court.add(courtStatic);
  const tape = mat(0x2d6cdf, 0.7);
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d), tape);
    m.position.set(x, 0.002, z); m.receiveShadow = true; courtStatic.add(m);
  };
  line(halfX * 2 + 0.02, 0.02, 0, -halfZ); line(halfX * 2 + 0.02, 0.02, 0, halfZ);
  line(0.02, halfZ * 2, -halfX, 0); line(0.02, halfZ * 2, halfX, 0);

  const postMat = mat(0xe8e8e8, 0.35);
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.6, 10), postMat);
    post.position.set(0, 0.3, sz * (halfZ + 0.05)); post.castShadow = true; courtStatic.add(post);
    const capM = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mat(0xffd23f, 0.4)); capM.position.set(0, 0.6, sz * (halfZ + 0.05)); courtStatic.add(capM);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12), mat(0x2d6cdf, 0.6)); pad.position.set(0, 0.12, sz * (halfZ + 0.05)); courtStatic.add(pad);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 6), mat(0xff3b3b, 0.5)); ant.position.set(0, 0.59, sz * halfZ); courtStatic.add(ant);
  }
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(halfZ * 2 + 0.08, 0.15),
    new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  net.rotation.y = Math.PI / 2; net.position.set(0, 0.49, 0); net.castShadow = true; court.add(net);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, halfZ * 2 + 0.08), mat(0xffffff, 0.5)); band.position.set(0, 0.565, 0); courtStatic.add(band);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, halfZ * 2 + 0.1, 4).rotateX(Math.PI / 2), mat(0x333333, 0.5)); cable.position.set(0, 0.415, 0); courtStatic.add(cable);
  bake(courtStatic, { name: 'court' });
  root.add(court);

  // 2 v 2. Sides: A (x<0) and B (x>0). Index 0 on each side is the one who hits.
  const kit = [
    { skin: SKIN[1], top: 0xffd23f, bottom: 0x2d6cdf, hair: 0x1b1b1b, hairStyle: 'short', hat: 'cap', hatColor: 0x2d6cdf },
    { skin: SKIN[3], top: 0xffd23f, bottom: 0x2d6cdf, hair: 0x7a4a21, hairStyle: 'pony' },
    { skin: SKIN[0], top: 0x3fa7ff, bottom: 0xff7a3d, hair: 0xd9b25c, hairStyle: 'bun' },
    { skin: SKIN[2], top: 0x3fa7ff, bottom: 0xff7a3d, hair: 0x20150e, hairStyle: 'short', glasses: true },
  ];
  const players = kit.map((k, i) => makePerson({ ...k, scale: [1, 0.96, 0.97, 1.03][i] }));
  const homes = [
    [-0.34, 0.0, Math.PI / 2], [-0.85, 0.28, Math.PI / 2],
    [0.34, 0.0, -Math.PI / 2], [0.85, -0.28, -Math.PI / 2],
  ];
  const sides = [[0, 1], [2, 3]];
  players.forEach((p, i) => { p.group.rotation.y = homes[i][2]; court.add(p.group); });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
  ball.castShadow = true;
  court.add(ball);

  const FLIGHT = 1.7;             // seconds per rally leg
  const HIT_H = 0.58;             // hand height when hitting (arms straight up)
  const hands = (i, jump) => new THREE.Vector3(homes[i][0], HIT_H + jump, homes[i][1]);
  const { clamp, lerp } = THREE.MathUtils;
  actors.push({
    update(t) {
      t = Math.max(0, t);                        // never index the rally with negative time (see main.js timer note)
      const leg = Math.floor(t / FLIGHT);
      const ph = (t % FLIGHT) / FLIGHT;          // 0..1 within the flight
      const from = ((leg % 2) + 2) % 2;          // side that just hit (safe modulo, always 0 or 1)
      const to = 1 - from;
      const hitterFrom = sides[from][0], hitterTo = sides[to][0];

      // receiving hitter crouches, then jumps to meet the ball in the last 30% of the flight
      const jumpPhase = clamp((ph - 0.68) / 0.32, 0, 1);
      const jumpTo = Math.sin(jumpPhase * Math.PI) * 0.13;
      const load = clamp((ph - 0.5) / 0.18, 0, 1) * (1 - jumpPhase);      // crouch before take-off
      // previous hitter lands in the first 25% of the next flight
      const landPhase = clamp(1 - ph / 0.25, 0, 1);
      const jumpFrom = Math.sin(landPhase * Math.PI * 0.5) * 0.06;

      players.forEach((p, i) => {
        let jump = 0, arm = 0.35, bend = 0.35;    // ready stance: knees soft, arms forward
        if (i === hitterTo) { jump = jumpTo; arm = lerp(0.35, 2.95, Math.min(1, jumpPhase * 1.6)); bend = 0.35 + load * 0.6 + jumpPhase * 0.4 * (1 - jumpPhase); }
        else if (i === hitterFrom) { jump = jumpFrom; arm = lerp(0.35, 2.95, landPhase); bend = 0.25 + landPhase * 0.3; }
        else bend = 0.4 + 0.12 * Math.sin(t * 2.2 + i);
        const sway = Math.sin(t * 2.2 + i) * 0.03;
        const home = homes[i];
        const sink = (1 - Math.cos(bend)) * 0.105 * 1.3; // knees bent -> hips lower
        p.group.position.set(home[0] + (i === sides[0][1] || i === sides[1][1] ? sway : 0), jump - sink, home[1] + (i === hitterTo ? 0 : sway));
        for (const k of [0, 1]) {
          p.legs[k].rotation.x = -bend;            // thighs forward
          p.knees[k].rotation.x = bend * 2;        // shins back -> feet under the body
          p.arms[k].rotation.x = -arm;
          p.arms[k].rotation.z = k ? -0.12 : 0.12;
          p.elbows[k].rotation.x = arm > 2 ? 0 : -0.5;
        }
        p.hips.rotation.x = bend * 0.45;           // lean forward to stay balanced
        p.head.rotation.x = -bend * 0.4 - (arm > 2 ? 0.35 : 0);
      });

      // ball travels along a parabola between the two hitters' hands
      const a = hands(hitterFrom, jumpFrom * 0.2), b = hands(hitterTo, 0.1);
      ball.position.lerpVectors(a, b, ph);
      ball.position.y += Math.sin(ph * Math.PI) * 0.38;
      ball.rotation.z = t * 6; ball.rotation.x = t * 3;
    },
  });

  return { group: root, update: (t) => actors.forEach((a) => a.update(t)) };
}
