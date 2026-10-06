import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { JellyState } from './sim/jellyState.js';
import { createShowcase } from './world/showcase.js';
import { Ocean } from './world/ocean.js';
import { Island } from './world/island.js';
import { Palms } from './world/palms.js';
import { createPeople } from './world/people.js';
import { FishSchool } from './world/fish.js';
import { Props } from './world/props.js';
import { DEFAULT_THEME, loadTheme, saveTheme, rel } from './theme.js';
import { islandHeight } from './sim/islandShape.js';

const canvas = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // (PCFSoftShadowMap was removed in r186; use shadow.radius)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene(); // transparent background: the CSS gradient shows through
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(9.6, 6.0, 11.4);
const TARGET = new THREE.Vector3(0, 0.4, 0);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = true;   // damping inertia also keeps the jelly wobbling after you let go
controls.dampingFactor = 0.06;
controls.minDistance = 7;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.53;
controls.enablePan = false;
controls.autoRotateSpeed = 1.2;

// ------------------------------------------------------------------ lights
scene.add(new THREE.HemisphereLight(0xdff3ff, 0xf3e0b0, 0.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(7, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xcfe6ff, 0.55); // cool bounce light from the opposite side, no shadows
fill.position.set(-8, 5, -6);
scene.add(fill);

// ------------------------------------------------------------------ world
const jelly = new JellyState();
const showcase = createShowcase();
const ocean = new Ocean(jelly);
const island = new Island(jelly);
const palms = new Palms(jelly);
const people = createPeople();
const fish = new FishSchool(jelly, ocean);
const props = new Props(jelly);
scene.add(showcase, island.mesh, ocean.mesh, palms.group, people.group, fish.group, props.group);

// ------------------------------------------------------------------ interaction
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;

canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; hideHint(); });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 450;
  down = null;
  if (moved < 6 && quick) poke(e.clientX, e.clientY);
});

/** Click = poke. Finds what was hit and tells the JellyState; ocean/island/palms/fish react on their own. */
function poke(clientX, clientY, strength = 1) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [ocean.mesh, island.mesh, palms.group];
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) return null;
  let obj = hit.object, kind = null, owner = null;
  while (obj) {
    if (obj.userData?.kind) { kind = obj.userData.kind; owner = obj; break; }
    obj = obj.parent;
  }
  if (!kind) return null;
  jelly.impulse(hit.point, strength, kind, owner);
  return { kind, point: hit.point };
}

// ------------------------------------------------------------------ UI
const ctlJelly = document.getElementById('ctl-jelly');
const ctlRotate = document.getElementById('ctl-rotate');
ctlJelly.addEventListener('input', () => { jelly.strength = parseFloat(ctlJelly.value); });
ctlRotate.addEventListener('change', () => { controls.autoRotate = ctlRotate.checked; });
// Colour pickers: sea, sand, grass, sky. Choices are remembered per browser (localStorage, best effort).
const pickers = { sea: 'col-sea', sand: 'col-sand', grass: 'col-grass', sky: 'col-sky' };
let theme = loadTheme();
function applyTheme(t) {
  ocean.setSeaColor(t.sea);
  showcase.userData.setWaterColor(t.sea);
  island.setColors(t);
  props.setGrassColor(t.grass);
  const css = document.documentElement.style;
  css.setProperty('--sky-mid', t.sky);
  css.setProperty('--sky-edge', '#' + rel(t.sky, DEFAULT_THEME.sky, 0x8cc9e8).getHexString());
  css.setProperty('--sky-core', '#' + rel(t.sky, DEFAULT_THEME.sky, 0xfff6df).getHexString());
  for (const [k, id] of Object.entries(pickers)) document.getElementById(id).value = t[k];
}
for (const [k, id] of Object.entries(pickers)) {
  document.getElementById(id).addEventListener('input', (e) => {
    theme = { ...theme, [k]: e.target.value };
    applyTheme(theme);
    saveTheme(theme);
  });
}
document.getElementById('col-reset').addEventListener('click', () => { theme = { ...DEFAULT_THEME }; applyTheme(theme); saveTheme(theme); });
applyTheme(theme);

const hint = document.querySelector('.hint');
function hideHint() { hint.classList.add('hide'); }
setTimeout(hideHint, 12000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the whole case in frame on narrow screens
  camera.fov = w / h < 0.9 ? 55 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer(); // (THREE.Clock is deprecated since r183)
const debugEl = document.getElementById('debug');
if (DEBUG) debugEl.hidden = false;
let frames = 0, fpsT = 0, fps = 0, simTime = 0;

function frame(now) {
  timer.update(now);
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const t = timer.getElapsed();
  simTime = t;

  controls.update();
  jelly.update(dt, camera, controls.target);
  ocean.update(dt, t);
  island.update(dt);
  palms.update(dt, t);
  people.update(t);
  fish.update(dt, t);
  props.update(dt, t);
  renderer.render(scene, camera);

  frames++; fpsT += rawDt; // real time (dt is clamped for the physics)
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (DEBUG) {
    debugEl.textContent =
      `fps ${fps.toFixed(0)}  rot ${jelly.rotationSpeed.toFixed(2)} rad/s\n` +
      `sea activity ${ocean.agitation.toFixed(4)}  fish fear ${fish.fear.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}

// Test / agent hook: lets scripts/smoke-test.mjs and other agents drive and inspect the scene.
window.__JELLY__ = {
  ready: true,
  THREE, islandHeight, renderer, scene, camera, controls, jelly, ocean, island, palms, fish, people, props,
  /** Advance the simulation `seconds` without rendering (deterministic tests; slow software GL can't keep real time). */
  advance(seconds, step = 1 / 60) {
    for (let i = 0; i < Math.round(seconds / step); i++) {
      simTime += step;
      ocean.update(step, simTime); island.update(step); palms.update(step, simTime); people.update(simTime); fish.update(step, simTime); props.update(step, simTime);
    }
  },
  /** Set colours programmatically, e.g. setColors({ sea: '#ff66aa' }) (same as the pickers). */
  setColors: (partial) => { theme = { ...theme, ...partial }; applyTheme(theme); return theme; },
  poke,                                   // poke(clientX, clientY) => {kind, point}
  pokeWorld: (x, y, z, kind = 'ocean', s = 1) => jelly.impulse(new THREE.Vector3(x, y, z), s, kind, null),
  state: () => ({
    fps, rotationSpeed: jelly.rotationSpeed, seaActivity: ocean.agitation, fishFear: fish.fear,
    maxWave: ocean.grid.maxAbsHeight(),
    islandSquash: island.py.x, palmBend: palms.palms.map((p) => Math.hypot(p.bx.x, p.bz.x)),
  }),
};
frame();
