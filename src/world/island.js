import * as THREE from 'three';
import { CASE } from '../config.js';
import { Spring } from '../sim/spring.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';

const SIZE = CASE.half * 2;
const SEG = 120;

function smooth(x, a, b) { return THREE.MathUtils.smoothstep(x, a, b); }

/**
 * The island mesh: a vertex-coloured height field (sand / wet sand / seabed / grass) built from
 * islandHeight(). It jiggles by a *matrix* (squash + shear about the seabed), not by touching vertices,
 * so it is cheap and the people standing on it stay put (they are not parented to it).
 */
export class Island {
  /** @param {import('../sim/jellyState.js').JellyState} jelly */
  constructor(jelly) {
    this.jelly = jelly;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sandSea = new THREE.Color(0xc4b27c), sandWet = new THREE.Color(0xc9b078), sandDry = new THREE.Color(0xf6e6b4);
    const deepTint = new THREE.Color(0x2a86b4);
    const grass = new THREE.Color(0x63b94f), grassDark = new THREE.Color(0x3f9a45), rock = new THREE.Color(0xb9a47a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = islandHeight(x, z);
      pos.setY(i, h);
      c.copy(sandSea).lerp(sandWet, smooth(h, -1.6, -0.1)).lerp(sandDry, smooth(h, -0.05, 0.22));
      c.lerp(rock, 0.18 * smooth(-h, 1.4, 2.4));
      c.lerp(deepTint, 0.6 * smooth(-h, 0.15, 2.2)); // underwater parts read as seen through water
      const gd = Math.hypot(x - LAYOUT.grassCentre[0], z - LAYOUT.grassCentre[1]) + Math.sin(x * 3.3 + z * 2.1) * 0.18;
      const gm = (1 - smooth(gd, LAYOUT.grassRadius - 0.45, LAYOUT.grassRadius)) * smooth(h, 0.3, 0.42);
      c.lerp(grass, gm).lerp(grassDark, gm * 0.45 * (0.5 + 0.5 * Math.sin(x * 5 + z * 4)));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    this.mesh.name = 'island';
    this.mesh.userData.kind = 'island';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;

    // own springs so a click on the island wobbles it independently of camera sloshing
    this.px = new Spring(70, 3.2); // shear in x
    this.pz = new Spring(70, 3.2); // shear in z
    this.py = new Spring(90, 3.4); // squash
    this._m = new THREE.Matrix4();

    jelly.onImpulse((p, s, kind) => {
      // direct hits wobble hardest; palm/sea pokes only nudge the island
      const k = (kind === 'island' ? 1 : kind === 'palm' ? 0.45 : 0.25) * s * jelly.strength;
      this.px.kick(-Math.sign(p.x || 1) * 0.35 * k); // shear away from the poke
      this.pz.kick(-Math.sign(p.z || 1) * 0.35 * k);
      this.py.kick(-1.4 * k);                        // squash down, then spring back and overshoot
    });
  }

  update(dt) {
    const { jelly } = this;
    const k = jelly.strength;
    this.px.step(dt, jelly.sx.x * 3.0 * k);
    this.pz.step(dt, jelly.sz.x * 3.0 * k);
    this.py.step(dt, jelly.sy.x * 2.0 * k);

    // keep it *slight*: tiny shear (max ~0.03 per unit height) and up to ~3% squash
    const shx = THREE.MathUtils.clamp(this.px.x * 0.04, -0.03, 0.03);
    const shz = THREE.MathUtils.clamp(this.pz.x * 0.04, -0.03, 0.03);
    const sy = 1 + THREE.MathUtils.clamp(this.py.x * 0.03, -0.03, 0.03);
    const b = CASE.floorY;
    // x' = x + shx*(y-b), y' = b + sy*(y-b), z' = z + shz*(y-b)
    this._m.set(
      1, shx, 0, -shx * b,
      0, sy, 0, b - sy * b,
      0, shz, 1, -shz * b,
      0, 0, 0, 1
    );
    this.mesh.matrix.copy(this._m);
    this.mesh.matrixWorldNeedsUpdate = true;
  }
}
