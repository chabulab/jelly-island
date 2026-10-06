import * as THREE from 'three';
import { CASE, WAVE } from '../config.js';
import { WaveGrid } from '../sim/waveGrid.js';
import { islandHeight } from '../sim/islandShape.js';

const SIZE = CASE.half * 2;

/**
 * The sea surface. Height of each vertex =
 *   (idle ocean swell  +  jelly simulation  +  global slosh tilt) * edge mask
 * - idle swell: a few sines, always on ("moving waves")
 * - jelly sim : WaveGrid, excited by clicks and by camera rotation (see update())
 * - slosh tilt: the whole sea leans/rocks when the user orbits (JellyState springs)
 * The edge mask pins the surface to the glass walls so it always meets the wall tops.
 */
export class Ocean {
  /** @param {import('../sim/jellyState.js').JellyState} jelly */
  constructor(jelly) {
    this.jelly = jelly;
    this.grid = new WaveGrid(WAVE.cells, SIZE, (x, z) => islandHeight(x, z) > WAVE.solidHeight);
    const N = WAVE.cells;

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;
    const pos = geo.attributes.position;
    this.count = pos.count;

    // Vertex i of PlaneGeometry is row-major, so it maps 1:1 to WaveGrid index i.
    this.baseX = new Float32Array(this.count);
    this.baseZ = new Float32Array(this.count);
    this.mask = new Float32Array(this.count);
    this.baseColor = new Float32Array(this.count * 3);
    const colors = new Float32Array(this.count * 3);
    const shallow = new THREE.Color(0x46d9cf), mid = new THREE.Color(0x1fa3d0), deep = new THREE.Color(0x0f5fb0);
    const foam = new THREE.Color(0xffffff);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      this.baseX[i] = x; this.baseZ[i] = z;
      const edge = Math.min(CASE.half - Math.abs(x), CASE.half - Math.abs(z));
      this.mask[i] = THREE.MathUtils.smoothstep(edge, 0, 0.9);
      const depth = -islandHeight(x, z);
      c.copy(shallow).lerp(mid, THREE.MathUtils.smoothstep(depth, 0.0, 0.9)).lerp(deep, THREE.MathUtils.smoothstep(depth, 0.9, 2.4));
      c.lerp(foam, 1 - THREE.MathUtils.smoothstep(depth, -0.25, 0.22)); // white foam line along the shore
      this.baseColor[i * 3] = c.r; this.baseColor[i * 3 + 1] = c.g; this.baseColor[i * 3 + 2] = c.b;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.colorAttr = geo.attributes.color;

    this.material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xbff7ff),
      envMapIntensity: 1.2,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'ocean';
    this.mesh.userData.kind = 'ocean';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;

    jelly.onImpulse((p, s, kind) => {
      if (kind === 'ocean') this.grid.ripple(p.x, p.z, WAVE.clickStrength * s * jelly.strength, WAVE.clickRadius);
      else if (kind === 'palm') this.grid.ripple(p.x * 1.3, p.z * 1.3, 0.012 * s * jelly.strength, 0.9); // little splash near the shore
    });

    this._rotAcc = 0;
  }

  update(dt, t) {
    const { jelly, grid } = this;
    const strength = jelly.strength;

    // Orbiting the case sloshes the sea: sprinkle random ripples around the rim, harder when rotating faster.
    const rot = jelly.rotationSpeed;
    if (rot > 0.12 && strength > 0) {
      this._rotAcc += dt * Math.min(rot, 3) * 6;
      while (this._rotAcc >= 1) {
        this._rotAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const rad = CASE.half * (0.45 + Math.random() * 0.5);
        grid.ripple(Math.cos(a) * rad, Math.sin(a) * rad, 0.012 * Math.min(rot, 3) * strength, 0.6 + Math.random() * 0.5);
      }
    }
    grid.update(dt);

    const pos = this.geo.attributes.position;
    const h = grid.h;
    const tiltX = jelly.sx.x * 0.12 * strength;
    const tiltZ = jelly.sz.x * 0.12 * strength;
    const lift = jelly.sy.x * 0.05 * strength;
    const gain = 0.55 + 0.45 * strength; // keep a visible response even at low jelliness
    const sim = strength <= 0 ? 0 : gain;
    const col = this.colorAttr;
    const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    for (let i = 0; i < this.count; i++) {
      const x = this.baseX[i], z = this.baseZ[i];
      const idle =
        0.045 * Math.sin(x * 1.3 + t * 1.1) +
        0.035 * Math.sin(z * 1.7 - t * 0.9 + x * 0.4) +
        0.018 * Math.sin((x + z) * 2.7 + t * 1.7);
      const y = (idle + h[i] * sim + tiltX * x + tiltZ * z + lift) * this.mask[i];
      pos.setY(i, y);
      // crests catch light, troughs darken: sells the gelatin look
      const k = THREE.MathUtils.clamp(y * 0.9, -0.25, 0.35);
      col.setXYZ(i, cl(this.baseColor[i * 3] + k), cl(this.baseColor[i * 3 + 1] + k), cl(this.baseColor[i * 3 + 2] + k * 0.6));
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere(); // keeps raycasts / culling correct
    this.material.opacity = 0.8 + Math.min(0.1, grid.activity * 10);
  }

  /** 0..1 how aggressive the sea currently is (what scares the fish). */
  get agitation() { return this.grid.activity; }
}
