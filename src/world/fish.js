import * as THREE from 'three';
import { CASE, FEAR, FISH } from '../config.js';
import { islandHeight, islandGradient } from '../sim/islandShape.js';

const SPECIES = [
  { body: 0xff8a2b, fin: 0xffd9a8, stripe: 0xffffff, size: 1.5 },   // clownfish-ish
  { body: 0x2f7be8, fin: 0xffe14d, stripe: 0x123a7a, size: 1.7 },  // blue tang-ish
  { body: 0xffd23f, fin: 0xff9f1c, stripe: 0xfff2b0, size: 1.4 },   // butterflyfish-ish
  { body: 0xe85d9a, fin: 0xffc2dd, stripe: 0xffffff, size: 1.3 },
];
const bodyGeo = new THREE.SphereGeometry(0.1, 14, 10).scale(1.45, 0.82, 0.45);
const tailGeo = new THREE.ConeGeometry(0.075, 0.14, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.25); // points +x; we flip below
const finGeo = new THREE.ConeGeometry(0.045, 0.1, 4).scale(1, 1, 0.2);
const eyeGeo = new THREE.SphereGeometry(0.024, 8, 6);
const pupilGeo = new THREE.SphereGeometry(0.013, 6, 5);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });

const FWD = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _g = [0, 0];

class Fish {
  constructor(i, sp) {
    this.i = i;
    this.sp = sp;
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: sp.body, roughness: 0.35, metalness: 0.1 });
    const finMat = new THREE.MeshStandardMaterial({ color: sp.fin, roughness: 0.5, side: THREE.DoubleSide });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 14).scale(0.55, 1, 1), new THREE.MeshStandardMaterial({ color: sp.stripe, roughness: 0.5 }));
    stripe.rotation.y = Math.PI / 2; stripe.position.x = 0.03; stripe.scale.set(1, 0.8, 0.55);
    this.tail = new THREE.Group(); this.tail.position.x = -0.13;
    const tailMesh = new THREE.Mesh(tailGeo, finMat); tailMesh.rotation.z = Math.PI; tailMesh.position.x = -0.06;
    this.tail.add(tailMesh);
    const dorsal = new THREE.Mesh(finGeo, finMat); dorsal.position.set(-0.01, 0.075, 0); dorsal.rotation.z = 0.2;
    this.eyes = [];
    for (const sz of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(0.1, 0.03, sz * 0.036);
      e.add(new THREE.Mesh(eyeGeo, eyeMat));
      const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(0.012, 0, sz * 0.005); e.add(p);
      this.group.add(e); this.eyes.push(e);
    }
    this.group.add(body, stripe, this.tail, dorsal);
    this.group.scale.setScalar(sp.size);
    this.bodyMat = bodyMat;
    this.baseColor = new THREE.Color(sp.body);
    this.pale = new THREE.Color(sp.body).lerp(new THREE.Color(0xffffff), 0.35);

    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
    this.pos = new THREE.Vector3(Math.cos(a) * r, THREE.MathUtils.lerp(FISH.minY + 0.3, FISH.maxY - 0.2, Math.random()), Math.sin(a) * r);
    this.vel = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(0.5);
    this.phase = Math.random() * 100;
    this.wag = Math.random() * 6;
    this.fear = 0;
    this.depthPref = THREE.MathUtils.lerp(-1.6, -0.55, Math.random());
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
    this.fish = Array.from({ length: FISH.count }, (_, i) => new Fish(i, SPECIES[i % SPECIES.length]));
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
      f.bodyMat.color.copy(f.baseColor).lerp(f.pale, fear * 0.8);
    }
    this.fear = sum / this.fish.length;
  }
}
