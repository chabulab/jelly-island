import { WAVE } from '../config.js';

/**
 * 2D damped wave equation with a restoring term ("Klein-Gordon" water) on a regular grid.
 * - waves propagate (neighbour coupling),
 * - a restoring pull toward zero gives the whole surface a slow wobble -> "jelly",
 * - the border is pinned to 0 (glass walls) and `solid` cells (island) are pinned too, so ripples reflect.
 * Pure typed-array code: no three.js, unit-tested in tests/waveGrid.test.js.
 */
export class WaveGrid {
  /**
   * @param {number} cells  N, grid has (N+1)x(N+1) points
   * @param {number} size   world width of the grid (units)
   * @param {(x:number,z:number)=>boolean} [isSolid]  marks cells that are land
   */
  constructor(cells = WAVE.cells, size = 10, isSolid = null) {
    this.N = cells;
    this.W = cells + 1;
    this.size = size;
    this.cell = size / cells;
    const M = this.W * this.W;
    this.h = new Float32Array(M);
    this.v = new Float32Array(M);
    this.solid = new Uint8Array(M);
    this.activity = 0; // smoothed mean |v| of free cells: "how aggressively is the sea moving"
    this._acc = 0;
    this._free = 0;
    for (let r = 0; r < this.W; r++) {
      for (let c = 0; c < this.W; c++) {
        const i = r * this.W + c;
        const edge = r === 0 || c === 0 || r === cells || c === cells;
        const land = isSolid ? isSolid(this.x(c), this.z(r)) : false;
        this.solid[i] = edge || land ? 1 : 0;
        if (!this.solid[i]) this._free++;
      }
    }
  }

  x(c) { return -this.size / 2 + c * this.cell; }
  z(r) { return -this.size / 2 + r * this.cell; }
  index(x, z) {
    const c = Math.round((x + this.size / 2) / this.cell);
    const r = Math.round((z + this.size / 2) / this.cell);
    return r * this.W + c;
  }

  /** Gaussian "poke": negative strength pushes the water down, positive up. */
  ripple(x, z, strength = WAVE.clickStrength, radius = WAVE.clickRadius) {
    const rc = radius / this.cell;
    const c0 = (x + this.size / 2) / this.cell;
    const r0 = (z + this.size / 2) / this.cell;
    const span = Math.ceil(rc * 2.5);
    for (let r = Math.max(1, Math.floor(r0 - span)); r <= Math.min(this.N - 1, Math.ceil(r0 + span)); r++) {
      for (let c = Math.max(1, Math.floor(c0 - span)); c <= Math.min(this.N - 1, Math.ceil(c0 + span)); c++) {
        const i = r * this.W + c;
        if (this.solid[i]) continue;
        const d2 = ((c - c0) ** 2 + (r - r0) ** 2) / (rc * rc);
        this.v[i] -= strength * Math.exp(-d2);
      }
    }
  }

  /** One fixed simulation step. */
  step() {
    const { W, N, h, v, solid } = this;
    const k = WAVE.wave, rest = WAVE.restore, damp = WAVE.damping;
    let sum = 0;
    for (let r = 1; r < N; r++) {
      for (let c = 1; c < N; c++) {
        const i = r * W + c;
        if (solid[i]) { h[i] = 0; v[i] = 0; continue; }
        const lap = h[i - 1] + h[i + 1] + h[i - W] + h[i + W] - 4 * h[i];
        v[i] = (v[i] + lap * k - h[i] * rest) * damp;
        sum += Math.abs(v[i]);
      }
    }
    for (let i = 0; i < h.length; i++) if (!solid[i]) h[i] += v[i];
    const mean = sum / Math.max(1, this._free);
    this.activity += (mean - this.activity) * 0.08;
  }

  /** Advance by real time using a fixed-rate accumulator (frame-rate independent). */
  update(dt) {
    this._acc = Math.min(this._acc + dt, 0.1);
    const h = 1 / WAVE.stepHz;
    while (this._acc >= h) { this.step(); this._acc -= h; }
  }

  maxAbsHeight() {
    let m = 0;
    for (let i = 0; i < this.h.length; i++) m = Math.max(m, Math.abs(this.h[i]));
    return m;
  }
}
