import * as THREE from 'three';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';
import { stripeTexture, netTexture, ballTexture } from '../fx/textures.js';

/**
 * Beach life. IMPORTANT: nothing here reads JellyState - people are deliberately immune to the jelly wobble.
 * (They are also not children of the island mesh, which is what jiggles.)
 * Figures are ~0.46 units tall (palms are 2.2-2.9, so ~1:5, like real life).
 */
const mats = {};
const mat = (hex, rough = 0.7) => (mats[hex + ':' + rough] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
const SKIN = [0xf1c6a0, 0xc68a5e, 0x8d5a3b, 0xe8b48a];

/** Person facing +z, origin at the feet. Limb pivots are exposed for posing. */
function makePerson({ skin, top, bottom, hair, hat = false, glasses = false, long = false }) {
  const g = new THREE.Group();
  const s = mat(skin, 0.6);
  const cap = (r, len, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), m);

  const hips = new THREE.Group(); hips.position.y = 0.2; g.add(hips);
  const legs = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.022, 0, 0);
    const m = cap(0.019, 0.16, s); m.position.y = -0.1; m.castShadow = true; p.add(m); hips.add(p); return p;
  });
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.043, 0.07, 10), mat(bottom)); shorts.position.y = 0.01; shorts.castShadow = true; hips.add(shorts);

  const torso = cap(0.037, 0.1, mat(top)); torso.position.y = 0.075; torso.castShadow = true; hips.add(torso);
  const arms = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.055, 0.12, 0);
    const m = cap(0.014, 0.12, s); m.position.y = -0.07; m.castShadow = true; p.add(m); p.rotation.z = sx * 0.12; hips.add(p); return p;
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 12), s); head.position.y = 0.22; head.castShadow = true; hips.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.043, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hair, 0.9));
  hairM.position.y = 0.225; hairM.rotation.x = -0.25; hips.add(hairM);
  if (long) { const tail = cap(0.02, 0.07, mat(hair, 0.9)); tail.position.set(0, 0.17, -0.04); hips.add(tail); }
  if (glasses) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.012), mat(0x151515, 0.2)); gl.position.set(0, 0.228, 0.037); hips.add(gl);
  }
  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 20), mat(0xf4e3a1)); brim.position.y = 0.253; hips.add(brim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf4e3a1)); dome.position.y = 0.253; hips.add(dome);
  }
  return { group: g, hips, legs, arms, torso, head };
}

function place(obj, x, z, lift = 0) { obj.position.set(x, islandHeight(x, z) + lift, z); }

export function createPeople() {
  const root = new THREE.Group();
  root.name = 'people';
  const actors = [];   // things with update(t)

  // ---------------- sunbathers ----------------
  const towelColors = [['#ff6b6b', '#ffffff'], ['#39a0ed', '#ffe066']];
  const outfits = [
    { skin: SKIN[0], top: 0xff5d8f, bottom: 0xff5d8f, hair: 0x3a2412, glasses: true, long: true },
    { skin: SKIN[2], top: 0x2a9d8f, bottom: 0x2a9d8f, hair: 0x15110d, glasses: true, hat: true },
  ];
  LAYOUT.towels.forEach((tw, i) => {
    const wrap = new THREE.Group();
    place(wrap, tw.x, tw.z, 0.012);
    wrap.rotation.y = tw.rot;
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.012, 0.64),
      new THREE.MeshStandardMaterial({ map: stripeTexture(towelColors[i], 8, [1, 1]), roughness: 0.95 })
    );
    towel.receiveShadow = true; towel.castShadow = true; towel.position.y = 0.006;
    wrap.add(towel);

    const p = makePerson(outfits[i]);
    p.group.rotation.x = -Math.PI / 2;           // lie on the back, head toward -z
    p.group.position.set(0, 0.052, 0.24);
    p.arms[0].rotation.set(0, 0, 0.35);          // relaxed
    p.arms[1].rotation.set(-0.5, 0, i ? -1.9 : -0.3); // one hand behind the head for the second
    p.legs[1].rotation.x = i ? -0.1 : 0.15;
    wrap.add(p.group);
    root.add(wrap);
    actors.push({ update: (t) => { p.hips.scale.set(1, 1 + Math.sin(t * 1.4 + i) * 0.012, 1 + Math.sin(t * 1.4 + i) * 0.02); } }); // breathing
  });

  // umbrella over the first sunbather
  const um = new THREE.Group();
  place(um, LAYOUT.umbrella.x + 0.12, LAYOUT.umbrella.z - 0.3);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.62, 6), mat(0xeeeeee)); pole.position.y = 0.31; pole.castShadow = true;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.14, 12, 1, true),
    new THREE.MeshStandardMaterial({ map: stripeTexture(['#ff5d5d', '#ffffff'], 6, [2, 1]), side: THREE.DoubleSide, roughness: 0.8 })
  );
  canopy.position.y = 0.6; canopy.castShadow = true;
  um.add(pole, canopy); um.rotation.z = -0.18;
  root.add(um);

  // ---------------- beach volleyball ----------------
  const { cx, cz, halfX, halfZ } = LAYOUT.court;
  const court = new THREE.Group();
  place(court, cx, cz, 0.004);
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d), mat(0xffffff, 0.9));
    m.position.set(x, 0.002, z); m.receiveShadow = true; court.add(m);
  };
  line(halfX * 2, 0.02, 0, -halfZ); line(halfX * 2, 0.02, 0, halfZ);
  line(0.02, halfZ * 2, -halfX, 0); line(0.02, halfZ * 2, halfX, 0);

  const postMat = mat(0xdddddd, 0.4);
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.58, 8), postMat);
    post.position.set(0, 0.29, sz * (halfZ + 0.04)); post.castShadow = true; court.add(post);
  }
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(halfZ * 2 + 0.08, 0.16),
    new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide })
  );
  net.rotation.y = Math.PI / 2; net.position.set(0, 0.49, 0); net.castShadow = true; court.add(net);
  root.add(court);

  // 2 v 2. Sides: A (x<0) and B (x>0). Index 0 on each side is the one who hits.
  const kit = [
    { skin: SKIN[1], top: 0xffd23f, bottom: 0x2d6cdf, hair: 0x1b1b1b },
    { skin: SKIN[3], top: 0xffd23f, bottom: 0x2d6cdf, hair: 0x7a4a21, long: true },
    { skin: SKIN[0], top: 0x3fa7ff, bottom: 0xff7a3d, hair: 0xd9b25c },
    { skin: SKIN[2], top: 0x3fa7ff, bottom: 0xff7a3d, hair: 0x20150e, glasses: true },
  ];
  const players = kit.map((k) => makePerson(k));
  const homes = [
    [-0.34, 0.0, Math.PI / 2], [-0.85, 0.28, Math.PI / 2],
    [0.34, 0.0, -Math.PI / 2], [0.85, -0.28, -Math.PI / 2],
  ];
  const sides = [[0, 1], [2, 3]];
  players.forEach((p, i) => {
    p.group.rotation.y = homes[i][2];
    court.add(p.group);
  });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.5 }));
  ball.castShadow = true;
  court.add(ball);

  const FLIGHT = 1.7;             // seconds per rally leg
  const HIT_H = 0.5;              // hand height when hitting
  const hands = (i, jump) => new THREE.Vector3(homes[i][0], HIT_H + jump, homes[i][1]);
  actors.push({
    update(t) {
      const leg = Math.floor(t / FLIGHT);
      const ph = (t % FLIGHT) / FLIGHT;          // 0..1 within the flight
      const from = leg % 2;                      // side that just hit
      const to = 1 - from;
      const hitterFrom = sides[from][0], hitterTo = sides[to][0];

      // receiving hitter jumps up to meet the ball in the last 30% of the flight
      const jumpPhase = THREE.MathUtils.clamp((ph - 0.68) / 0.32, 0, 1);
      const jumpTo = Math.sin(jumpPhase * Math.PI) * 0.13;
      // previous hitter lands in the first 25% of the next flight
      const landPhase = THREE.MathUtils.clamp(1 - ph / 0.25, 0, 1);
      const jumpFrom = Math.sin(landPhase * Math.PI * 0.5) * 0.06;

      players.forEach((p, i) => {
        let jump = 0, arm = 0.2;
        if (i === hitterTo) { jump = jumpTo; arm = THREE.MathUtils.lerp(0.2, 2.9, Math.min(1, jumpPhase * 1.6)); }
        else if (i === hitterFrom) { jump = jumpFrom; arm = THREE.MathUtils.lerp(0.2, 2.9, landPhase); }
        const sway = Math.sin(t * 2.2 + i) * 0.03;
        const home = homes[i];
        p.group.position.set(home[0] + (i === sides[0][1] || i === sides[1][1] ? sway : 0), jump, home[1] + (i === hitterTo ? 0 : sway));
        p.arms[0].rotation.x = -arm; p.arms[1].rotation.x = -arm;
        p.arms[0].rotation.z = -0.1; p.arms[1].rotation.z = 0.1;
        const crouch = i === hitterTo ? 0 : 0.12 * Math.sin(t * 2.2 + i);
        p.hips.rotation.x = 0.15 * (1 - jumpPhase * (i === hitterTo ? 1 : 0)) + crouch * 0.2;
        p.legs[0].rotation.x = -jump * 2.2; p.legs[1].rotation.x = jump * 1.2;
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
