import * as THREE from 'three';
import { Spring } from '../sim/spring.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';
import { rng } from '../util/rng.js';
import { bake } from '../util/bake.js';

const SEGMENTS = 9;

const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
const frondMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
const nutMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
const bossMat = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.85 });

/**
 * One trunk segment: a lathe whose profile bulges just under its top edge and pinches at the joint,
 * so stacked segments read as the ringed leaf scars of a coconut palm. Vertex colours darken each scar.
 */
function trunkSegmentGeometry(rb, rt, h, flare = 0) {
  const pts = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = rb + (rt - rb) * t;
    r *= 1 + 0.11 * THREE.MathUtils.smoothstep(t, 0.45, 0.88) - 0.09 * THREE.MathUtils.smoothstep(t, 0.9, 1.0);
    r *= 1 + flare * Math.pow(1 - t, 3);
    pts.push(new THREE.Vector2(r, t * h * 1.02));
  }
  const g = new THREE.LatheGeometry(pts, 10);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const light = new THREE.Color(0xa77a52), dark = new THREE.Color(0x6b4a30), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / h;
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    c.copy(light).lerp(dark, THREE.MathUtils.smoothstep(t, 0.78, 0.97) * 0.85 + 0.12 * (0.5 + 0.5 * Math.sin(ang * 3 + t * 9)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Pinnate frond: an arching rachis (midrib) with paired leaflets that hang in a shallow V.
 * Built along +x (width along z). Vertex colours: dark at the base, bright mid, yellowish tips.
 */
function frondGeometry({ len = 1.25, pairs = 20, leafLen = 0.36, droop = 0.65, arch = 0.3, seed = 1, dry = false }) {
  const r = rng(seed);
  const pos = [], col = [], idx = [];
  const base = new THREE.Color(dry ? 0x8a6a3c : 0x2f7d3a), mid = new THREE.Color(dry ? 0xb08a50 : 0x4fae47), tip = new THREE.Color(dry ? 0xc9a466 : 0x9fd35a);
  const c = new THREE.Color();
  const P = (t) => new THREE.Vector3(t * len, arch * Math.sin(t * Math.PI * 0.55) * len - droop * Math.pow(t, 2.2) * len * 0.75, 0);
  const push = (v, t, k = 1) => {
    c.copy(base).lerp(mid, Math.min(1, t * 1.6)).lerp(tip, Math.max(0, t - 0.55) * 1.6 * k);
    pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  // rachis as a thin ribbon
  const RS = 14;
  for (let i = 0; i <= RS; i++) {
    const t = i / RS, p = P(t), w = 0.014 * (1 - t * 0.7);
    push(new THREE.Vector3(p.x, p.y + 0.004, -w), t, 0.3);
    push(new THREE.Vector3(p.x, p.y + 0.004, w), t, 0.3);
    if (i < RS) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const down = new THREE.Vector3(0, -1, 0);
  for (let k = 0; k < pairs; k++) {
    const t = 0.1 + 0.88 * (k / (pairs - 1));
    const p = P(t);
    const T = P(Math.min(1, t + 0.01)).sub(P(Math.max(0, t - 0.01))).normalize();
    const L = leafLen * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.55) * (1 - 0.3 * t) * r.range(0.85, 1.1);
    const w = 0.042 * (1 - 0.45 * t);
    for (const side of [-1, 1]) {
      const S = new THREE.Vector3(0, 0, side);
      const D = new THREE.Vector3().addScaledVector(T, 0.55).addScaledVector(S, 1).addScaledVector(down, 0.42 + 0.25 * t).normalize();
      const curl = down.clone().multiplyScalar(0.05 * L);
      const b0 = push(p.clone().addScaledVector(T, -w * 0.5), t);
      const b1 = push(p.clone().addScaledVector(T, w * 0.5), t);
      const m = p.clone().addScaledVector(D, L * 0.55).add(curl);
      const m0 = push(m.clone().addScaledVector(T, -w * 0.35), t + 0.08);
      const m1 = push(m.clone().addScaledVector(T, w * 0.45), t + 0.08);
      const tp = push(p.clone().addScaledVector(D, L).addScaledVector(T, w * 0.6).add(curl.multiplyScalar(2.6)), t + 0.25);
      idx.push(b0, b1, m0, b1, m1, m0, m0, m1, tp);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const FRONDS = [1, 2, 3].map((seed, i) => frondGeometry({ seed, len: 1.18 + i * 0.1, droop: 0.55 + i * 0.08 }));
const YOUNG = frondGeometry({ seed: 9, len: 0.8, pairs: 14, leafLen: 0.26, droop: 0.15, arch: 0.15 });
const DRY = frondGeometry({ seed: 11, len: 0.95, pairs: 16, leafLen: 0.28, droop: 0.3, arch: 0.05, dry: true });

function coconutGeometry() {
  const g = new THREE.SphereGeometry(0.072, 14, 10).scale(1, 1.18, 1);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(0x5e7d2a), b = new THREE.Color(0x6b4a2a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(a).lerp(b, THREE.MathUtils.smoothstep(pos.getY(i), 0.05, -0.08)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const NUT = coconutGeometry();

class Palm {
  constructor(spec, id) {
    this.id = id;
    this.spec = spec;
    const r = rng(100 + id);
    this.root = new THREE.Group();
    this.root.userData.kind = 'palm';
    this.root.userData.palm = this;
    const y0 = islandHeight(spec.x, spec.z) - 0.05;
    this.root.position.set(spec.x, y0, spec.z);
    this.root.rotation.y = r.range(0, Math.PI * 2);
    this.base = new THREE.Vector3(spec.x, y0, spec.z);

    // trunk: chained segments (each a child of the previous) so bending propagates up the stem
    const segH = spec.h / SEGMENTS;
    this.segs = [];
    let parent = this.root;
    for (let i = 0; i < SEGMENTS; i++) {
      const rb = 0.125 * (1 - (i / SEGMENTS) * 0.5), rt = 0.125 * (1 - ((i + 1) / SEGMENTS) * 0.5);
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : segH;
      const mesh = new THREE.Mesh(trunkSegmentGeometry(rb, rt, segH, i === 0 ? 0.55 : 0), trunkMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      seg.add(mesh);
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }

    // crown sits at the top of the last segment
    this.crown = new THREE.Group();
    this.crown.position.y = segH;
    parent.add(this.crown);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10).scale(1, 0.8, 1), bossMat);
    boss.castShadow = true;
    this.crown.add(boss);

    this.fronds = [];
    const addFrond = (geo, yaw, pitch, scale, phase) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      const leaf = new THREE.Mesh(geo, frondMat);
      leaf.castShadow = true;
      leaf.rotation.z = pitch;
      leaf.rotation.x = r.range(-0.12, 0.12); // slight roll so leaflets don't all face the same way
      leaf.scale.setScalar(scale);
      pivot.add(leaf);
      this.crown.add(pivot);
      this.fronds.push({ leaf, base: pitch, phase });
    };
    const golden = 2.39996;
    for (let i = 0; i < 11; i++) addFrond(FRONDS[i % 3], i * golden, r.range(0.25, 0.7), r.range(0.88, 1.08), i * 1.7 + id);
    for (let i = 0; i < 3; i++) addFrond(YOUNG, i * 2.1 + 0.5, r.range(1.0, 1.25), r.range(0.8, 1.0), i * 2.3 + id);
    addFrond(DRY, r.range(0, 6.28), -1.05, 0.9, id * 3.1); // one dead frond hanging against the trunk

    const nuts = 4 + (id % 3);
    for (let i = 0; i < nuts; i++) {
      const nut = new THREE.Mesh(NUT, nutMat);
      const a = (i / nuts) * Math.PI * 2 + r.range(-0.3, 0.3);
      nut.position.set(Math.cos(a) * 0.1, -0.09 - r.range(0, 0.05), Math.sin(a) * 0.1);
      nut.rotation.set(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4));
      nut.castShadow = true;
      this.crown.add(nut);
    }
    bake(this.crown, { deep: false, name: 'crown' }); // boss + coconuts in one draw call

    // bend springs (angle, radians): trunk bend toward +x / +z, and a whippier crown pair
    this.bx = new Spring(36, 1.7);
    this.bz = new Spring(36, 1.7);
    this.cx = new Spring(110, 2.2);
    this.cz = new Spring(110, 2.2);
    this.flap = new Spring(60, 1.5);
    this.lean = spec.lean;
    // lean direction is given in world space; convert into the root's rotated frame
    const l = Math.hypot(spec.dir[0], spec.dir[1]) || 1;
    const ry = this.root.rotation.y, wx = spec.dir[0] / l, wz = spec.dir[1] / l;
    this.dir = [wx * Math.cos(ry) - wz * Math.sin(ry), wx * Math.sin(ry) + wz * Math.cos(ry)];
    this._ry = ry;
  }

  update(dt, t, jelly) {
    const k = jelly.strength;
    this.bx.step(dt, jelly.sx.x * 2.2 * k);
    this.bz.step(dt, jelly.sz.x * 2.2 * k);
    this.cx.step(dt, this.bx.v * 1.2);
    this.cz.step(dt, this.bz.v * 1.2);
    this.flap.step(dt, (Math.abs(this.bx.v) + Math.abs(this.bz.v)) * 0.8);

    const idleX = Math.sin(t * 0.8 + this.id) * 0.012;
    const idleZ = Math.cos(t * 0.7 + this.id * 1.3) * 0.012;
    const clamp = (x) => THREE.MathUtils.clamp(x, -0.35, 0.35);
    // springs live in world space (slosh / pokes are world directions); rotate into the palm's own frame
    const cs = Math.cos(this._ry), sn = Math.sin(this._ry);
    const toLocal = (x, z) => [x * cs - z * sn, x * sn + z * cs];
    const [bx, bz] = toLocal(clamp(this.bx.x) + idleX, clamp(this.bz.x) + idleZ);
    const [cx, cz] = toLocal(clamp(this.cx.x), clamp(this.cz.x));
    for (let i = 0; i < this.segs.length; i++) {
      const w = (i + 1) / this.segs.length; // top bends more than the base
      const seg = this.segs[i];
      const tiltX = (this.lean * this.dir[0]) / SEGMENTS + bx * w * 0.4;
      const tiltZ = (this.lean * this.dir[1]) / SEGMENTS + bz * w * 0.4;
      seg.rotation.z = -tiltX; // tilting toward +x is a negative rotation about z
      seg.rotation.x = tiltZ;
    }
    this.crown.rotation.z = -cx * 0.5;
    this.crown.rotation.x = cz * 0.5;
    const f = clamp(this.flap.x);
    for (const fr of this.fronds) fr.leaf.rotation.z = fr.base + Math.sin(t * 1.3 + fr.phase) * 0.04 + f * (0.6 + 0.4 * Math.sin(fr.phase));
  }
}

export class Palms {
  /** @param {import('../sim/jellyState.js').JellyState} jelly */
  constructor(jelly) {
    this.jelly = jelly;
    this.group = new THREE.Group();
    this.group.name = 'palms';
    this.palms = LAYOUT.palms.map((spec, i) => new Palm(spec, i));
    for (const p of this.palms) this.group.add(p.root);

    jelly.onImpulse((point, s, kind, object) => {
      const hit = object?.userData?.palm ?? null; // set by main.js when kind === 'palm'
      for (const p of this.palms) {
        const dx = p.base.x - point.x, dz = p.base.z - point.z;
        const d = Math.hypot(dx, dz);
        const falloff = p === hit ? 1 : Math.exp(-d / 1.8) * (kind === 'ocean' ? 0.25 : 0.7);
        const dir = d > 1e-3 ? [dx / d, dz / d] : [1, 0];
        const kick = 1.6 * s * falloff * jelly.strength;
        p.bx.kick(dir[0] * kick);
        p.bz.kick(dir[1] * kick);
        p.flap.kick((Math.random() - 0.5) * kick);
      }
    });
  }

  update(dt, t) {
    for (const p of this.palms) p.update(dt, t, this.jelly);
  }
}
