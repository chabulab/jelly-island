/** Damped harmonic oscillator, semi-implicit Euler. Pure JS (no three.js) so it can be unit-tested. */
export class Spring {
  constructor(k = 60, c = 3, x = 0, v = 0) {
    this.k = k; // stiffness
    this.c = c; // damping
    this.x = x; // position
    this.v = v; // velocity
  }
  /** Advance by dt seconds under an optional external force. Sub-steps keep it stable for large dt. */
  step(dt, force = 0) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * this.x - this.c * this.v + force) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(dv) { this.v += dv; }
}
