import * as THREE from 'three';
import { Spring } from '../sim/spring.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';

const SEGMENTS = 6;

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9, flatShading: true });
const ringMat = new THREE.MeshStandardMaterial({ color: 0x6d4527, roughness: 0.95 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3fae4a, roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2f9a45, roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
const nutMat = new THREE.MeshStandardMaterial({ color: 0x5b3a20, roughness: 0.6 });

/** A drooping, feathery frond along +x (width along z). Zig-zag edge = leaflets. */
function frondGeometry(len = 1.15, width = 0.2, droop = 0.55, n = 10) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len;
    const y = -droop * t * t * len * 0.8 + 0.12 * Math.sin(t * Math.PI);
    const w = width * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.7) * (i % 2 ? 1 : 0.62);
    pos.push(x, y - 0.05 * w, -w, x, y, 0, x, y - 0.05 * w, w);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = (i + 1) * 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const FROND_GEO = frondGeometry();

class Palm {
  constructor(spec, id) {
    this.id = id;
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.userData.kind = 'palm';
    this.root.userData.palm = this;
    const y0 = islandHeight(spec.x, spec.z) - 0.06;
    this.root.position.set(spec.x, y0, spec.z);
    this.base = new THREE.Vector3(spec.x, y0, spec.z);

    const segH = spec.h / SEGMENTS;
    this.segs = [];
    let parent = this.root;
    for (let i = 0; i < SEGMENTS; i++) {
      const rb = 0.13 * (1 - (i / SEGMENTS) * 0.55), rt = 0.13 * (1 - ((i + 1) / SEGMENTS) * 0.55);
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : segH;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, segH * 1.04, 7), trunkMat);
      mesh.position.y = segH / 2;
      mesh.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rb * 1.02, 0.018, 5, 10), ringMat);
      ring.rotation.x = Math.PI / 2;
      seg.add(mesh, ring);
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }

    // crown sits at the top of the last segment
    this.crown = new THREE.Group();
    this.crown.position.y = segH;
    parent.add(this.crown);
    this.fronds = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / n) * Math.PI * 2 + (id % 3) * 0.3;
      const leaf = new THREE.Mesh(FROND_GEO, i % 2 ? leafMat : leafMat2);
      leaf.castShadow = true;
      leaf.rotation.z = 0.5 + (i % 3) * 0.1;
      leaf.scale.setScalar(0.9 + (i % 4) * 0.08);
      pivot.add(leaf);
      this.crown.add(pivot);
      this.fronds.push({ leaf, base: leaf.rotation.z, phase: i * 1.7 + id });
    }
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), nutMat);
      const a = i * 2.1 + id;
      nut.position.set(Math.cos(a) * 0.1, -0.08, Math.sin(a) * 0.1);
      nut.castShadow = true;
      this.crown.add(nut);
    }

    // bend springs (angle, radians): trunk bend toward +x / +z, and a whippier crown pair
    this.bx = new Spring(36, 1.7);
    this.bz = new Spring(36, 1.7);
    this.cx = new Spring(110, 2.2);
    this.cz = new Spring(110, 2.2);
    this.flap = new Spring(60, 1.5);
    this.lean = spec.lean;
    const l = Math.hypot(spec.dir[0], spec.dir[1]) || 1;
    this.dir = [spec.dir[0] / l, spec.dir[1] / l];
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
    for (let i = 0; i < this.segs.length; i++) {
      const w = (i + 1) / this.segs.length; // top bends more than the base
      const seg = this.segs[i];
      const tiltX = this.lean * this.dir[0] / SEGMENTS + (clamp(this.bx.x) + idleX) * w * 0.55;
      const tiltZ = this.lean * this.dir[1] / SEGMENTS + (clamp(this.bz.x) + idleZ) * w * 0.55;
      seg.rotation.z = -tiltX; // tilting toward +x is a negative rotation about z
      seg.rotation.x = tiltZ;
    }
    this.crown.rotation.z = -clamp(this.cx.x) * 0.5;
    this.crown.rotation.x = clamp(this.cz.x) * 0.5;
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
