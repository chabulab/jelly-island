import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';
import { rng } from '../util/rng.js';
import { bake } from '../util/bake.js';

/**
 * Set dressing that makes the diorama feel finished: shoreline rocks, grass tufts, flowering bushes,
 * shells and starfish, a sandcastle with bucket and spade, a cooler, flip-flops, and an underwater garden of
 * corals and swaying seaweed. Land props are static (like the people); seaweed sways and sloshes with the jelly.
 */
const mats = new Map();
const std = (color, o = {}) => {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o }));
  return mats.get(key);
};
const vcol = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, ...o });

function colorize(g, fn) {
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { fn(c, pos.getX(i), pos.getY(i), pos.getZ(i)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Walk outward from the centre along an angle until the ground drops to `level`. */
function radiusAtLevel(angle, level) {
  for (let r = 1.2; r < 5; r += 0.01) if (islandHeight(Math.cos(angle) * r, Math.sin(angle) * r) < level) return r;
  return 5;
}
const onGround = (obj, x, z, lift = 0) => { obj.position.set(x, islandHeight(x, z) + lift, z); return obj; };

function grassMask(x, z) {
  const gd = Math.hypot(x - LAYOUT.grassCentre[0], z - LAYOUT.grassCentre[1]) + Math.sin(x * 3.3 + z * 2.1) * 0.18;
  return gd < LAYOUT.grassRadius - 0.5 && islandHeight(x, z) > 0.42;
}
const nearPalm = (x, z, d) => LAYOUT.palms.some((p) => Math.hypot(p.x - x, p.z - z) < d);

export class Props {
  /** @param {import('../sim/jellyState.js').JellyState} jelly */
  constructor(jelly) {
    this.jelly = jelly;
    this.group = new THREE.Group();
    this.group.name = 'props';
    const r = rng(42);
    const G = this.group;
    const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; G.add(m); return m; };

    // ---------------- shoreline rocks ----------------
    const rockMat = vcol({ roughness: 0.9, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r.range(-0.25, 0.25);
      if (Math.abs(a % (Math.PI * 2) - 1.57) < 0.5) continue; // keep the front beach (court side) open
      const rad = radiusAtLevel(a, r.range(-0.05, 0.12));
      const size = r.range(0.09, 0.2);
      const g = new THREE.IcosahedronGeometry(size, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * r.range(0.85, 1.15), p.getY(k) * r.range(0.6, 0.85), p.getZ(k) * r.range(0.85, 1.15));
      g.computeVertexNormals();
      colorize(g, (c, x, y) => c.set(0x8d8a80).lerp(new THREE.Color(0xb7b0a0), THREE.MathUtils.smoothstep(y, -size * 0.3, size * 0.6)));
      const m = add(new THREE.Mesh(g, rockMat));
      onGround(m, Math.cos(a) * rad, Math.sin(a) * rad, -size * 0.25);
      m.rotation.set(r.range(-0.3, 0.3), r.range(0, 6.28), r.range(-0.3, 0.3));
      // a smaller buddy rock
      const m2 = add(new THREE.Mesh(g, rockMat));
      m2.scale.setScalar(r.range(0.4, 0.6));
      onGround(m2, Math.cos(a + 0.06) * (rad + 0.18), Math.sin(a + 0.06) * (rad + 0.18), -size * 0.15);
    }

    // ---------------- grass tufts (instanced) ----------------
    const tuft = (() => {
      const pos = [], col = [], dark = new THREE.Color(0x3d8a3a), light = new THREE.Color(0xa6dc6a);
      for (let b = 0; b < 6; b++) {
        const ang = (b / 6) * Math.PI * 2 + b * 0.4, lean = 0.35 + (b % 3) * 0.12, h = 0.07 + (b % 3) * 0.02, w = 0.009;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const tip = [dx * Math.sin(lean) * h, Math.cos(lean) * h, dz * Math.sin(lean) * h];
        pos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, ...tip);
        col.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    })();
    const tuftMat = vcol({ side: THREE.DoubleSide, roughness: 0.7 });
    const spots = [];
    for (let tries = 0; tries < 4000 && spots.length < 220; tries++) {
      const x = r.range(-2.5, 2.5), z = r.range(-2.8, 0.8);
      if (grassMask(x, z) && !nearPalm(x, z, 0.22)) spots.push([x, z]);
    }
    const tufts = new THREE.InstancedMesh(tuft, tuftMat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e = new THREE.Euler();
    spots.forEach(([x, z], i) => {
      const k = r.range(0.6, 1.15);
      m4.compose(p3.set(x, islandHeight(x, z) - 0.005, z), q.setFromEuler(e.set(0, r.range(0, 6.28), 0)), s3.set(k, k * r.range(0.8, 1.3), k));
      tufts.setMatrixAt(i, m4);
    });
    tufts.receiveShadow = true;
    G.add(tufts);

    // ---------------- flowering bushes ----------------
    const leafMat = vcol({ roughness: 0.7 });
    const blobGeo = colorize(new THREE.IcosahedronGeometry(1, 2), (c, x, y) => c.set(0x3f9a45).lerp(new THREE.Color(0x7cc35a), THREE.MathUtils.smoothstep(y, -0.4, 0.9)));
    const flowerCols = [0xff4f6d, 0xffd23f, 0xff8fb8, 0xffffff];
    for (const [bx, bz, n] of [[-1.3, -1.35, 5], [0.95, -1.7, 4], [-0.35, -1.08, 4], [2.2, -1.0, 5], [-2.0, -0.2, 3]]) {
      const bush = onGround(new THREE.Group(), bx, bz, -0.02);
      for (let i = 0; i < n; i++) {
        const rad = r.range(0.07, 0.13);
        const b = new THREE.Mesh(blobGeo, leafMat);
        b.scale.set(rad, rad * 0.85, rad);
        b.position.set(r.range(-0.12, 0.12), rad * 0.7 + r.range(0, 0.05), r.range(-0.12, 0.12));
        b.castShadow = b.receiveShadow = true;
        bush.add(b);
        for (let f = 0; f < 2; f++) {
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 0.5, 1), std(r.pick(flowerCols), { roughness: 0.5 }));
          const dir = new THREE.Vector3(r.range(-1, 1), r.range(0.2, 1), r.range(-1, 1)).normalize();
          fl.position.copy(b.position).addScaledVector(dir, rad * 0.95);
          fl.lookAt(fl.position.clone().add(dir));
          fl.rotateX(Math.PI / 2);
          bush.add(fl);
        }
      }
      G.add(bush);
    }

    // ---------------- shells & starfish ----------------
    const starShape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.02 : 0.055;
      i ? starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }).rotateX(-Math.PI / 2);
    const shellGeo = colorize(new THREE.SphereGeometry(0.03, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 0.85),
      (c, x, y, z) => c.set(0xfbe6dc).lerp(new THREE.Color(0xf0a98f), 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 9)));
    const shellMat = vcol({ roughness: 0.4 });
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, Math.PI * 2), rad = radiusAtLevel(a, r.range(0.04, 0.3));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (x > -1.3 && x < 1.3 && z > 0.6 && z < 2.0) continue; // not on the court
      const star = i % 4 === 0;
      const m = add(new THREE.Mesh(star ? starGeo : shellGeo, star ? std(r.pick([0xff7a3d, 0xf05d7a, 0xffa94d]), { roughness: 0.6 }) : shellMat), false);
      onGround(m, x, z, 0.004);
      m.rotation.y = r.range(0, 6.28);
      if (star) m.scale.setScalar(r.range(0.8, 1.2));
    }
    for (let i = 0; i < 6; i++) { // starfish on the seabed
      const a = r.range(0, Math.PI * 2), rad = radiusAtLevel(a, r.range(-1.7, -0.9));
      const m = add(new THREE.Mesh(starGeo, std(r.pick([0xff7a3d, 0x9b5de5, 0xf05d7a]), { roughness: 0.6 })), false);
      onGround(m, Math.cos(a) * rad, Math.sin(a) * rad, 0.006);
      m.rotation.y = r.range(0, 6.28);
      m.scale.setScalar(1.3);
    }

    // ---------------- sandcastle, bucket & spade ----------------
    const sand = std(0xe8cf93, { roughness: 0.95 });
    const castle = onGround(new THREE.Group(), 1.6, 1.95, -0.01);
    castle.rotation.y = -0.5;
    castle.scale.setScalar(0.62);
    const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 20), sand); cbase.position.y = 0.025; castle.add(cbase);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), sand); wall.position.y = 0.08; castle.add(wall);
    for (const [tx, tz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.13, 12), sand); tw.position.set(tx, 0.115, tz); castle.add(tw);
      for (let k = 0; k < 4; k++) {
        const cr = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.018), sand);
        cr.position.set(tx + Math.cos(k * 1.57) * 0.028, 0.19, tz + Math.sin(k * 1.57) * 0.028); castle.add(cr);
      }
    }
    const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.17, 14), sand); keep.position.y = 0.17; castle.add(keep);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 14), sand); roof.position.y = 0.295; castle.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), std(0x8a5a36)); pole.position.y = 0.39; castle.add(pole);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.035, 4, 1).translate(0.03, 0, 0), std(0xff4f6d, { side: THREE.DoubleSide }));
    this.flag.position.set(0.003, 0.43, 0); castle.add(this.flag);
    castle.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    G.add(castle);

    const bucket = onGround(new THREE.Group(), 1.9, 1.7, 0.035);
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 18, 1, true), std(0x2d9cdb, { side: THREE.DoubleSide, roughness: 0.4 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 6, 20).rotateX(Math.PI / 2), std(0x2d9cdb, { roughness: 0.4 })); rim.position.y = 0.035;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.002, 4, 16, Math.PI), std(0xffd23f)); handle.position.y = 0.035;
    bucket.add(bk, rim, handle);
    bucket.rotation.set(0, 0.6, Math.PI / 2.2);
    bucket.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.add(bucket);
    const spade = onGround(new THREE.Group(), 1.3, 2.25, 0.01);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.05), std(0xffd23f, { roughness: 0.4 }));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6).rotateX(Math.PI / 2), std(0xff7a3d)); shaft.position.z = -0.08;
    spade.add(blade, shaft); spade.rotation.y = 0.9;
    G.add(spade);

    // ---------------- cooler & flip-flops ----------------
    const cooler = onGround(new THREE.Group(), -2.05, 0.7, 0);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.11, 0.12, 3, 0.015), std(0x2d6cdf, { roughness: 0.35 })); body.position.y = 0.055;
    const lid = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.03, 0.13, 3, 0.012), std(0xffffff, { roughness: 0.35 })); lid.position.y = 0.122;
    cooler.add(body, lid); cooler.rotation.y = 0.4;
    cooler.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    G.add(cooler);
    const flopGeo = new RoundedBoxGeometry(0.04, 0.008, 0.095, 2, 0.003);
    for (const [fx, fz, rot, col] of [[2.0, 0.35, 0.3, 0xff8fb8], [2.06, 0.38, 0.45, 0xff8fb8]]) {
      const f = add(new THREE.Mesh(flopGeo, std(col, { roughness: 0.5 })));
      onGround(f, fx, fz, 0.004); f.rotation.y = rot;
    }

    // ---------------- underwater garden ----------------
    const coralCols = [0xff7f9e, 0xff9f43, 0xb06cf0, 0xff5e78, 0x58d6c4];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + r.range(-0.2, 0.2);
      const rad = radiusAtLevel(a, r.range(-1.8, -0.9));
      const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
      const cluster = onGround(new THREE.Group(), cx, cz, -0.02);
      const kind = i % 3, colr = std(coralCols[i % coralCols.length], { roughness: 0.6 });
      if (kind === 0) { // branching
        for (let b = 0; b < 7; b++) {
          const len = r.range(0.1, 0.22);
          const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, len, 3, 6), colr);
          br.position.set(r.range(-0.05, 0.05), len * 0.45, r.range(-0.05, 0.05));
          br.rotation.set(r.range(-0.6, 0.6), 0, r.range(-0.6, 0.6));
          cluster.add(br);
        }
      } else if (kind === 1) { // brain coral
        const g = new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k); const f = 1 + 0.07 * Math.sin(x * 90) * Math.sin(z * 90 + y * 40); p.setXYZ(k, x * f, y * f, z * f); }
        g.computeVertexNormals();
        cluster.add(new THREE.Mesh(g, std(0xe6d36b, { roughness: 0.7 })));
      } else { // tubes + a fan
        for (let b = 0; b < 5; b++) {
          const h = r.range(0.08, 0.16);
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, h, 10, 1, true), std(coralCols[(i + b) % coralCols.length], { side: THREE.DoubleSide, roughness: 0.6 }));
          tube.position.set(r.range(-0.07, 0.07), h / 2, r.range(-0.07, 0.07));
          cluster.add(tube);
        }
        // sea fan: thin branches spread in one plane, with knobbly tips
        const fan = new THREE.Group();
        const fanMat = std(0xb06cf0, { roughness: 0.7 });
        for (let k = 0; k < 9; k++) {
          const ang = -1.1 + (k / 8) * 2.2, len = r.range(0.09, 0.15);
          const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, len, 2, 5), fanMat);
          br.position.set(Math.sin(ang) * len * 0.5, Math.cos(ang) * len * 0.5, 0);
          br.rotation.z = -ang;
          fan.add(br);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), fanMat);
          tip.position.set(Math.sin(ang) * len, Math.cos(ang) * len, 0);
          fan.add(tip);
        }
        fan.position.set(0.08, 0, 0); fan.rotation.y = a;
        cluster.add(fan);
      }
      cluster.scale.setScalar(r.range(1.4, 2.0));
      cluster.rotation.y = r.range(0, 6.28);
      cluster.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      G.add(cluster);
    }

    // seaweed ribbons, animated on the CPU (tiny vertex count)
    this.weeds = [];
    const weedMat = vcol({ side: THREE.DoubleSide, roughness: 0.6 });
    for (let i = 0; i < 18; i++) {
      const a = r.range(0, Math.PI * 2), rad = radiusAtLevel(a, r.range(-1.9, -1.1));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, y0 = islandHeight(x, z);
      const L = Math.min(r.range(0.4, 0.8), -y0 - 0.35);
      if (L < 0.2) continue;
      const g = new THREE.PlaneGeometry(0.045, L, 1, 12).translate(0, L / 2, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (1 - 0.6 * (p.getY(k) / L)));
      colorize(g, (c, _x, y) => c.set(i % 2 ? 0x2f8f4e : 0x5a9a2f).lerp(new THREE.Color(0xa7d36a), y / L));
      const m = new THREE.Mesh(g, weedMat);
      m.position.set(x, y0 - 0.02, z);
      m.rotation.y = r.range(0, Math.PI);
      G.add(m);
      this.weeds.push({ m, base: Float32Array.from(p.array), L, phase: r.range(0, 6.28) });
    }

    // Everything above except seaweed, the flag and the instanced grass is static: merge into one draw call.
    const animated = new Set([this.flag, ...this.weeds.map((w) => w.m)]);
    bake(G, { filter: (m) => !animated.has(m), name: 'props-static' });
  }

  update(dt, t) {
    const j = this.jelly;
    for (const w of this.weeds) {
      const p = w.m.geometry.attributes.position;
      const swayX = j.sx.x * 0.25 * j.strength, swayZ = j.sz.x * 0.25 * j.strength;
      for (let k = 0; k < p.count; k++) {
        const y = w.base[k * 3 + 1], f = Math.pow(Math.max(0, y / w.L), 1.6);
        p.setX(k, w.base[k * 3] + (Math.sin(t * 1.4 + w.phase + y * 4) * 0.07 + swayX) * f);
        p.setZ(k, w.base[k * 3 + 2] + (Math.cos(t * 1.1 + w.phase + y * 3) * 0.04 + swayZ) * f);
      }
      p.needsUpdate = true;
    }
    // flag flutter
    const fp = this.flag.geometry.attributes.position;
    for (let k = 0; k < fp.count; k++) fp.setZ(k, Math.sin(t * 8 + fp.getX(k) * 60) * 0.006 * (fp.getX(k) / 0.06));
    fp.needsUpdate = true;
  }
}
