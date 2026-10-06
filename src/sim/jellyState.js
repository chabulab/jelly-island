import * as THREE from 'three';
import { Spring } from './spring.js';

/**
 * Shared "how much is the user shaking the showcase" state. Everything that jiggles reads from here
 * (or subscribes to impulses); nothing else knows about pointer / camera details.
 *
 *  - sx / sz / sy : global springs kicked by camera motion (orbit => horizontal sloshing, tilt/zoom => vertical bounce)
 *  - rotationSpeed: smoothed camera speed in rad/s (orbit + tilt) -> drives ripples and fish worry
 *  - impulse(...) : a click / poke at a world point; listeners (ocean, island, palms, fish) react
 *  - strength     : user "Jelliness" slider, multiplies all visual response (0 = rigid showcase)
 */
export class JellyState {
  constructor() {
    this.strength = 1;
    this.sx = new Spring(22, 2.0);
    this.sz = new Spring(22, 2.0);
    this.sy = new Spring(34, 2.4);
    this.rotationSpeed = 0;
    this.lastPoint = new THREE.Vector3(0, 0, 0);
    this.lastImpulseTime = -1e9;
    this._listeners = [];
    this._prev = null;
    this._tmp = new THREE.Vector3();
  }

  onImpulse(fn) { this._listeners.push(fn); }

  /** @param {THREE.Vector3} point world point  @param {number} strength 0..1+  @param {'ocean'|'island'|'palm'} kind  @param {object} [object] hit object */
  impulse(point, strength = 1, kind = 'ocean', object = null) {
    this.lastPoint.copy(point);
    this.lastImpulseTime = performance.now() / 1000;
    for (const fn of this._listeners) fn(point, strength, kind, object);
  }

  /** Call once per frame with the orbit camera + its target. */
  update(dt, camera, target) {
    dt = Math.max(1e-4, Math.min(dt, 0.05));
    const off = this._tmp.copy(camera.position).sub(target);
    const dist = off.length();
    const az = Math.atan2(off.x, off.z);
    const pol = Math.acos(THREE.MathUtils.clamp(off.y / dist, -1, 1));

    if (this._prev) {
      let daz = az - this._prev.az;
      if (daz > Math.PI) daz -= 2 * Math.PI;
      if (daz < -Math.PI) daz += 2 * Math.PI;
      const dpol = pol - this._prev.pol;
      const ddist = (dist - this._prev.dist) * 0.08;
      const speed = Math.hypot(daz, dpol, ddist) / dt;
      this.rotationSpeed += (speed - this.rotationSpeed) * (1 - Math.exp(-dt * 8));

      // Orbit => the contents lag behind the glass: kick the sloshing springs along the camera-right tangent.
      const g = 7;
      const clampK = (x) => THREE.MathUtils.clamp(x, -4, 4);
      this.sx.kick(clampK(-Math.cos(az) * daz * g));
      this.sz.kick(clampK(Math.sin(az) * daz * g));
      this.sy.kick(clampK((dpol + ddist) * g * 0.8));
    }
    this._prev = { az, pol, dist };

    this.sx.step(dt);
    this.sz.step(dt);
    this.sy.step(dt);
  }
}
