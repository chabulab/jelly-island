import * as THREE from 'three';
import { CASE } from '../config.js';
import { Spring } from '../sim/spring.js';
import { islandHeight, LAYOUT } from '../sim/islandShape.js';

const SIZE = CASE.half * 2;
const SEG = 140;
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

/**
 * The island: a vertex-coloured height field (seabed, wet sand, dry sand, grass) built from islandHeight(),
 * closed on all four sides by a "cut-away" skirt (layered sand strata) where it meets the glass, so you can never
 * see into a hollow island.
 *
 * Jiggle: done in the vertex shader (squash + shear about the seabed) with a mask that is 1 in the middle and
 * fades to 0 near the glass. So the island wobbles like jelly but stays glued to the walls (no gaps, no poking
 * through the water walls). The same patch runs in the shadow-depth material so shadows follow.
 * People/props are NOT children of this mesh; they keep still.
 */
export class Island {
  /** @param {import('../sim/jellyState.js').JellyState} jelly */
  constructor(jelly) {
    this.jelly = jelly;

    this.uniforms = {
      uShear: { value: new THREE.Vector2() },
      uSquash: { value: 0 },
      uBase: { value: CASE.floorY },
      uHalf: { value: CASE.half },
    };
    const patch = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uShear; uniform float uSquash; uniform float uBase; uniform float uHalf;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            float edge = uHalf - max(abs(position.x), abs(position.z));
            float m = smoothstep(0.0, 1.8, edge);          // 0 at the glass, 1 inside
            float hgt = position.y - uBase;
            transformed.y = uBase + hgt * (1.0 + uSquash * m);
            transformed.xz += uShear * hgt * m;
          }`
        );
    };

    // ---- top surface ---------------------------------------------------------------------------
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const C = (h) => new THREE.Color(h);
    const sandSea = C(0xc9b47e), sandWet = C(0xd6bd84), sandDry = C(0xf7e7b6), sandWarm = C(0xf1d9a0);
    const grass = C(0x6cc152), grassDark = C(0x3f9a45), grassLight = C(0x9ad46a), deepTint = C(0x1f6f9f);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = islandHeight(x, z);
      pos.setY(i, h);
      const n = Math.sin(x * 7.1 + z * 3.3) * 0.5 + Math.sin(x * 2.3 - z * 5.9) * 0.5; // -1..1 fine noise
      c.copy(sandSea).lerp(sandWet, smooth(h, -1.6, -0.1)).lerp(sandDry, smooth(h, -0.05, 0.2));
      c.lerp(sandWarm, 0.35 * (0.5 + 0.5 * n) * smooth(h, 0.0, 0.3));                     // mottled dry sand
      c.lerp(C(0xbfa06a), 0.45 * (1 - Math.abs(smooth(h, -0.09, 0.0) - smooth(h, 0.0, 0.06)))); // wet line
      c.lerp(deepTint, 0.7 * smooth(-h, 0.15, 2.0));                                       // seen through water
      const gd = Math.hypot(x - LAYOUT.grassCentre[0], z - LAYOUT.grassCentre[1]) + Math.sin(x * 3.3 + z * 2.1) * 0.18;
      const gm = (1 - smooth(gd, LAYOUT.grassRadius - 0.45, LAYOUT.grassRadius)) * smooth(h, 0.3, 0.42);
      c.lerp(grass, gm);
      c.lerp(grassDark, gm * 0.4 * (0.5 + 0.5 * Math.sin(x * 5 + z * 4)));
      c.lerp(grassLight, gm * 0.3 * (0.5 + 0.5 * n));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    mat.onBeforeCompile = patch;
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = patch;

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'island';
    this.mesh.userData.kind = 'island';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = depthMat;

    // ---- cut-away sides (static: the jiggle mask is 0 at the glass) ------------------------------------
    this.skirt = new THREE.Mesh(skirtGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, side: THREE.DoubleSide }));
    this.skirt.name = 'island-skirt';
    this.skirt.receiveShadow = true;
    this.mesh.add(this.skirt); // child so raycasts on the island include it; no transform of its own

    // own springs so a click on the island wobbles it independently of camera sloshing
    this.px = new Spring(70, 3.2); // shear in x
    this.pz = new Spring(70, 3.2); // shear in z
    this.py = new Spring(90, 3.4); // squash

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
    // keep it *slight*: shear up to 0.03 per unit height, squash up to 3%
    this.uniforms.uShear.value.set(
      THREE.MathUtils.clamp(this.px.x * 0.04, -0.03, 0.03),
      THREE.MathUtils.clamp(this.pz.x * 0.04, -0.03, 0.03)
    );
    this.uniforms.uSquash.value = THREE.MathUtils.clamp(this.py.x * 0.03, -0.03, 0.03);
  }
}

/**
 * Four vertical walls from the island's edge profile down to the seabed, coloured as layered sand strata
 * (a diorama cross-section). Normals face outward toward the glass.
 */
function skirtGeometry() {
  const H = CASE.half, floor = CASE.floorY;
  const N = SEG, ROWS = 18;
  const strata = [0xf4dc9c, 0xe0b97a, 0xc99a60, 0xb07e4e, 0x8f6440, 0x76533a, 0x5f4433].map((h) => new THREE.Color(h));
  const pos = [], nor = [], col = [], idx = [];
  const sides = [
    { p: (s) => [s, H], n: [0, 0, 1] },
    { p: (s) => [H, -s], n: [1, 0, 0] },
    { p: (s) => [-s, -H], n: [0, 0, -1] },
    { p: (s) => [-H, s], n: [-1, 0, 0] },
  ];
  const c = new THREE.Color();
  for (const side of sides) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = -H + (i / N) * 2 * H;
      const [x, z] = side.p(s);
      const top = islandHeight(x, z);
      const along = s;
      for (let r = 0; r <= ROWS; r++) {
        const t = r / ROWS;
        const y = top + (floor - top) * t;
        pos.push(x, y, z);
        nor.push(...side.n);
        const depth = top - y;
        // wavy layer index: deeper = darker; layers undulate along the wall
        const wav = depth + 0.08 * Math.sin(along * 2.1 + depth * 3) + 0.04 * Math.sin(along * 5.3);
        const li = Math.max(0, wav / 0.36);
        const a = Math.min(strata.length - 1, Math.floor(li));
        const b = Math.min(strata.length - 1, a + 1);
        const f = li - Math.floor(li);
        c.copy(strata[a]).lerp(strata[b], smooth(f, 0.7, 1.0));
        if (f > 0.9) c.multiplyScalar(0.78);                       // thin dark seam between layers
        const speck = 0.5 + 0.5 * Math.sin(along * 37.1 + y * 53.7) * Math.sin(along * 13.3 - y * 29.1);
        c.multiplyScalar(0.94 + 0.08 * speck);                       // grain
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < ROWS; r++) {
        const a = base + i * (ROWS + 1) + r, b = a + ROWS + 1;
        // winding so the face points outward (+normal)
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
