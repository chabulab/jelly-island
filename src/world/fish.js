import * as THREE from 'three';
import { CASE, FEAR, FISH } from '../config.js';
import { islandHeight, islandGradient } from '../sim/islandShape.js';
import { bake } from '../util/bake.js';
import { rng } from '../util/rng.js';

/**
 * Species palettes + a per-vertex pattern function (x runs nose(+) to tail(-), y is up).
 * Body colours are baked into vertex colours so each species gets proper markings.
 */
const C = (h) => new THREE.Color(h);
const SPECIES = [
  { // clownfish: orange with three white bands edged in black
    fin: 0xff8a2b, finEdge: 0x1a1a1a, size: 1.45,
    paint(c, x, y) {
      c.copy(C(0xff7a1a)).lerp(C(0xffa45c), THREE.MathUtils.smoothstep(-y, 0.0, 0.07));
      for (const bx of [0.085, 0.005, -0.09]) {
        const d = Math.abs(x - bx);
        if (d < 0.018) c.set(0xffffff); else if (d < 0.026) c.set(0x1a1a1a);
      }
    },
  },
  { // blue tang: royal blue, dark saddle on the back, yellow tail
    fin: 0xffd23f, finEdge: 0x0f2a6b, size: 1.65,
    paint(c, x, y) {
      c.copy(C(0x2f7be8)).lerp(C(0x7fb2ff), THREE.MathUtils.smoothstep(-y, 0.02, 0.08));
      if (y > 0.02 - 0.12 * (x - 0.02) * (x + 0.1) && x < 0.07 && x > -0.11) c.lerp(C(0x0f2a6b), 0.85);
    },
  },
  { // butterflyfish: yellow with a black eye band and a dark spot near the tail
    fin: 0xffe066, finEdge: 0xff9f1c, size: 1.35,
    paint(c, x, y) {
      c.copy(C(0xffd23f)).lerp(C(0xfff3b0), THREE.MathUtils.smoothstep(-y, 0.0, 0.08));
      if (Math.abs(x - 0.105) < 0.012) c.set(0x1a1a1a);
      if (Math.hypot(x + 0.07, y - 0.03) < 0.018) c.set(0x1a1a1a);
    },
  },
  { // pink anthias: pink to lilac gradient with a gold streak under the eye
    fin: 0xffb3d9, finEdge: 0xb06cf0, size: 1.3,
    paint(c, x, y) {
      c.copy(C(0xf0609e)).lerp(C(0xb784f0), THREE.MathUtils.smoothstep(-x, -0.05, 0.12));
      if (Math.abs(y + 0.012 + (x - 0.1) * 0.4) < 0.007 && x > 0.04) c.set(0xffd23f);
    },
  },
];

/** Streamlined body: lathe profile (nose at +x), flattened sideways. */
function bodyGeometry(sp) {
  const prof = [[0, 0.16], [0.03, 0.155], [0.06, 0.13], [0.082, 0.085], [0.09, 0.03], [0.085, -0.03], [0.065, -0.085], [0.035, -0.125], [0.022, -0.145], [0, -0.152]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateZ(-Math.PI / 2).scale(1, 0.92, 0.46);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { sp.paint(c, pos.getX(i), pos.getY(i)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** Fin from a 2D shape (xy plane), vertex-coloured from root colour to edge colour. */
function finGeometry(shape, root, edge, reach) {
  const g = new THREE.ShapeGeometry(shape, 6);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(C(root)).lerp(C(edge), THREE.MathUtils.smoothstep(Math.hypot(pos.getX(i), pos.getY(i)), reach * 0.55, reach)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const tailShape = new THREE.Shape().moveTo(0, 0.012).quadraticCurveTo(-0.05, 0.03, -0.1, 0.075).quadraticCurveTo(-0.07, 0, -0.1, -0.075).quadraticCurveTo(-0.05, -0.03, 0, -0.012).closePath();
const dorsalShape = new THREE.Shape().moveTo(0.07, 0).quadraticCurveTo(0.02, 0.075, -0.08, 0.05).quadraticCurveTo(-0.1, 0.02, -0.1, 0).closePath();
const pecShape = new THREE.Shape().moveTo(0, 0).quadraticCurveTo(-0.02, 0.03, -0.055, 0.018).quadraticCurveTo(-0.045, -0.005, 0, 0).closePath();
const eyeGeo = new THREE.SphereGeometry(0.021, 12, 10);
const pupilGeo = new THREE.SphereGeometry(0.012, 10, 8);
const glintGeo = new THREE.SphereGeometry(0.004, 6, 4);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const GEOS = SPECIES.map((sp) => ({
  body: bodyGeometry(sp),
  tail: finGeometry(tailShape, sp.fin, sp.finEdge, 0.11),
  dorsal: finGeometry(dorsalShape, sp.fin, sp.finEdge, 0.1),
  pec: finGeometry(pecShape, sp.fin, sp.finEdge, 0.05),
}));

const FWD = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _g = [0, 0];

class Fish {
  constructor(i, spIndex) {
    const sp = SPECIES[spIndex], geo = GEOS[spIndex];
    this.i = i;
    this.sp = sp;
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0 });
    const finMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const body = new THREE.Mesh(geo.body, bodyMat);
    body.castShadow = true;
    this.tail = new THREE.Group(); this.tail.position.x = -0.14;
    this.tail.add(new THREE.Mesh(geo.tail, finMat));
    const dorsal = new THREE.Mesh(geo.dorsal, finMat); dorsal.position.set(0.0, 0.065, 0);
    const anal = new THREE.Mesh(geo.dorsal, finMat); anal.position.set(-0.04, -0.055, 0); anal.scale.set(0.55, -0.6, 1);
    this.pecs = [];
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.04, -0.02, sz * 0.038);
      const pec = new THREE.Mesh(geo.pec, finMat); pec.rotation.x = sz * 0.5; pivot.add(pec);
      this.group.add(pivot); this.pecs.push({ pivot, sz });
    }
    this.eyes = [];
    for (const sz of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(0.095, 0.025, sz * 0.03);
      e.add(new THREE.Mesh(eyeGeo, eyeMat));
      const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(0.008, 0, sz * 0.011); e.add(p);
      const gl = new THREE.Mesh(glintGeo, glintMat); gl.position.set(0.013, 0.006, sz * 0.02); e.add(gl);
      this.group.add(e); this.eyes.push(e);
    }
    this.group.add(body, this.tail, dorsal, anal);
    this.group.scale.setScalar(sp.size);
    // one draw call for body + dorsal + anal fins, one per eye; tail and pectorals stay separate (they animate)
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.05, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0 });
    bake(this.group, { deep: false, material: this.bodyMat, receiveShadow: false });
    for (const e of this.eyes) bake(e, { castShadow: false, receiveShadow: false });
    this.tail.children[0].castShadow = false;

    const rand = rng(500 + i); // seeded: same starting school every load
    const a = rand() * Math.PI * 2, r = 1.5 + rand() * 3;
    this.pos = new THREE.Vector3(Math.cos(a) * r, THREE.MathUtils.lerp(FISH.minY + 0.3, FISH.maxY - 0.2, rand()), Math.sin(a) * r);
    this.vel = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize().multiplyScalar(0.5);
    this.phase = rand() * 100;
    this.wag = rand() * 6;
    this.fear = 0;
    this.depthPref = THREE.MathUtils.lerp(-1.6, -0.55, rand());
    this.group.position.copy(this.pos);
  }
}

/**
 * Fish AI: wander + gentle schooling + steer around the island + keep inside the case.
 * FEAR is driven by ocean.agitation (physical: how violently the water is moving), with an extra
 * startle burst when a click lands nearby. Scared fish: speed up, tail beats fast, eyes bulge, bodies pale,
 * they dive and bolt toward shelter at the island's base instead of cruising. Fear fades as the sea calms.
 */
export class FishSchool {
  /** @param {import('../sim/jellyState.js').JellyState} jelly @param {import('./ocean.js').Ocean} ocean */
  constructor(jelly, ocean) {
    this.jelly = jelly;
    this.ocean = ocean;
    this.group = new THREE.Group();
    this.group.name = 'fish';
    this.fish = Array.from({ length: FISH.count }, (_, i) => new Fish(i, i % SPECIES.length));
    for (const f of this.fish) this.group.add(f.group);
    this.fear = 0; // school average, for debug/UI

    jelly.onImpulse((p, s, kind) => {
      for (const f of this.fish) {
        _d.set(f.pos.x - p.x, 0, f.pos.z - p.z);
        const d = _d.length();
        const reach = kind === 'ocean' ? 4.2 : 2.5;
        if (d < reach) {
          f.fear = Math.min(1, f.fear + (1 - d / reach) * 0.9 * s);
          f.vel.addScaledVector(_d.normalize(), 1.8 * (1 - d / reach) * s).y -= 0.5 * s; // dart away and down
        }
      }
    });
  }

  update(dt, t) {
    dt = Math.min(dt, 0.05);
    const ag = this.ocean.agitation + this.jelly.rotationSpeed * 0.0002;
    const worry = THREE.MathUtils.smoothstep(ag, FEAR.calm, FEAR.panic);
    let sum = 0;

    for (const f of this.fish) {
      // fear rises quickly with the sea, falls slowly after
      const rate = worry > f.fear ? 5 : 0.35;
      f.fear += (worry - f.fear) * (1 - Math.exp(-dt * rate));
      sum += f.fear;
      const fear = f.fear;

      // --- steering ---
      const acc = _v.set(0, 0, 0);
      // wander: slowly rotating heading
      const ang = t * 0.4 + f.phase;
      acc.x += Math.cos(ang) * 0.35; acc.z += Math.sin(ang * 1.3) * 0.35;
      // keep heading
      _d.copy(f.vel).setY(0).normalize().multiplyScalar(0.6); acc.add(_d);
      // schooling: loosely follow & cluster with same-index neighbours (cheap: 3 neighbours)
      for (let k = 1; k <= 3; k++) {
        const o = this.fish[(f.i + k * 5) % this.fish.length];
        _d.copy(o.pos).sub(f.pos);
        const dist = _d.length() || 1;
        if (dist < 0.4) acc.addScaledVector(_d, -0.8 / dist);                 // separation
        else if (dist < 3.2) acc.addScaledVector(_d, (0.12 + fear * 0.6) / dist); // cohesion (tighter when scared)
      }
      // depth: prefer own depth when calm, dive when scared
      const targetY = THREE.MathUtils.lerp(f.depthPref, FISH.minY + 0.1, fear);
      acc.y += (targetY - f.pos.y) * 1.4;
      // scared: head for the island's flanks (shelter) and away from the last disturbance
      if (fear > 0.05) {
        _d.set(-f.pos.x, 0, -f.pos.z).normalize().multiplyScalar(fear * 1.6);
        acc.add(_d);
        const away = _d.set(f.pos.x - this.jelly.lastPoint.x, 0, f.pos.z - this.jelly.lastPoint.z);
        const dd = away.length();
        if (dd < 5 && performance.now() / 1000 - this.jelly.lastImpulseTime < 6) acc.addScaledVector(away.normalize(), fear * 2.0);
        // panicky jitter
        acc.x += (Math.sin(t * 17 + f.phase) * 0.5) * fear; acc.z += (Math.cos(t * 15 + f.phase * 2) * 0.5) * fear;
      }
      // island avoidance (look-ahead along the heading)
      for (const la of [0, 0.5]) {
        const px = f.pos.x + f.vel.x * la, pz = f.pos.z + f.vel.z * la;
        const clear = f.pos.y - islandHeight(px, pz);
        if (clear < 0.55) {
          islandGradient(px, pz, _g);
          const m = Math.hypot(_g[0], _g[1]) || 1;
          const push = (0.55 - clear) * 6;
          acc.x += (-_g[0] / m) * push; acc.z += (-_g[1] / m) * push; acc.y += push * 0.5;
        }
      }
      // case walls
      const B = FISH.bound;
      if (Math.abs(f.pos.x) > B - 0.7) acc.x -= Math.sign(f.pos.x) * (Math.abs(f.pos.x) - (B - 0.7)) * 4;
      if (Math.abs(f.pos.z) > B - 0.7) acc.z -= Math.sign(f.pos.z) * (Math.abs(f.pos.z) - (B - 0.7)) * 4;
      // stay under the (wobbling) surface
      if (f.pos.y > FISH.maxY) acc.y -= (f.pos.y - FISH.maxY) * 6;
      if (f.pos.y < FISH.minY) acc.y += (FISH.minY - f.pos.y) * 6;

      // integrate with speed regulated by fear
      f.vel.addScaledVector(acc, dt * (2.2 + fear * 3));
      const maxSpeed = THREE.MathUtils.lerp(0.55, 2.7, fear);
      const sp = f.vel.length();
      if (sp > maxSpeed) f.vel.multiplyScalar(maxSpeed / sp);
      else if (sp < 0.25) f.vel.multiplyScalar(0.25 / (sp || 1));
      f.vel.y *= 0.96;
      f.pos.addScaledVector(f.vel, dt);

      // hard safety clamps
      f.pos.x = THREE.MathUtils.clamp(f.pos.x, -B, B);
      f.pos.z = THREE.MathUtils.clamp(f.pos.z, -B, B);
      f.pos.y = THREE.MathUtils.clamp(f.pos.y, Math.max(FISH.minY, islandHeight(f.pos.x, f.pos.z) + 0.12), FISH.maxY);

      // --- pose ---
      f.group.position.copy(f.pos);
      _d.copy(f.vel).normalize();
      _q.setFromUnitVectors(FWD, _d);
      f.group.quaternion.slerp(_q, 1 - Math.exp(-dt * 8));
      f.wag += dt * (7 + sp * 5 + fear * 22);
      f.tail.rotation.y = Math.sin(f.wag) * (0.35 + fear * 0.35);
      const eye = 1 + fear * 0.55; // wide-eyed
      for (const e of f.eyes) e.scale.setScalar(eye);
      f.bodyMat.emissiveIntensity = fear * 0.28; // blanch when scared
      for (const p of f.pecs) p.pivot.rotation.y = p.sz * (0.35 + Math.sin(f.wag * 0.5) * (0.25 + fear * 0.3));
    }
    this.fear = sum / this.fish.length;
  }
}
