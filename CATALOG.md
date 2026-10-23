---
project: jelly-island
path: jelly-island
title: Jelly Island
purpose: An interactive three.js showcase of a glass-cased island whose ocean wobbles like jelly, with beach life, skittish fish and recolourable scenery.
status: active
kind: web-app
stack: [threejs, javascript, vite, webgl, playwright, node-test]
repo: https://github.com/nhatchaubq/jelly-island
updated: 2026-10-23 (9a08e82)
---

# Jelly Island: catalog

## Purpose and users

A web toy and portfolio piece: a glass display case on a wooden pedestal, holding
an island, coconut palms, two sunbathers, a beach-volleyball rally and a school of
fish. Orbiting the camera or clicking the scene shakes the whole diorama like
gelatin; the ocean has a real wave simulation, the fish panic when the water is
agitated, and the viewer can change jelliness, auto-rotate and four base colours.
Everything is procedural: there are no image, model or audio assets.

## Features

| Feature | What it does for the user | Where (paths) |
|---|---|---|
| Orbit showcase | Damped orbit, zoom and pan of a glass case on a pedestal | `src/main.js`, `src/world/showcase.js` |
| Jelly ocean | A 96x96 wave simulation with a restoring term, so the surface wobbles and slowly settles | `src/sim/waveGrid.js`, `src/world/ocean.js` |
| Camera-driven slosh | Orbiting, tilting and zooming kick three shared springs, so the contents lag behind the glass | `src/sim/jellyState.js` |
| Click reactions | Clicking water, island or palm sends one impulse that ripples, squashes or bends the target | `src/main.js`, `src/world/island.js`, `src/world/palms.js` |
| Jelliness control | A 0 to 2 slider scales every response; 0 is a rigid showcase | `src/sim/jellyState.js`, `src/main.js` |
| Island jiggle | Vertex-shader squash and shear around the seabed, masked to zero at the glass | `src/world/island.js` |
| Coconut palms | Nine chained trunk segments, a ringed profile, baked coconuts, mature and young fronds, dead frond | `src/world/palms.js` |
| Beach life | Two sunbathers with towels, sunglasses and umbrella, plus four players in a looping 2v2 rally | `src/world/people.js` |
| Fish fear | Eighteen fish in four species speed up, dive, bulge their eyes, pale and shelter when the sea is agitated | `src/world/fish.js`, `src/sim/waveGrid.js` (`activity`) |
| Closed island | A cut-away sand skirt and strata close the height field so nothing looks hollow through the water walls | `src/sim/islandShape.js`, `src/world/island.js` |
| Colour pickers | Sea, sand, grass and sky change every derived shade through relative HSL offsets, and reset to the defaults | `src/theme.js`, `src/main.js` |
| Persisted colours | The picked palette is stored in `localStorage` on a best-effort basis | `src/theme.js` (`loadTheme`, `saveTheme`) |
| Code-drawn textures | Wood grain, plaques, net, ball, stripes, streaks and a soft blob shadow, all from canvas | `src/fx/textures.js` |
| Debug overlay | `?debug=1` shows fps, camera speed, sea activity and fish fear | `src/main.js` |
| Test hook | `window.__JELLY__` exposes state, `advance()`, `poke()`, `pokeWorld()` and the live scene | `src/main.js` |

## Tech stack

- Vanilla JavaScript ES modules, three.js 0.186.1, Vite 8.3.3. No framework.
- WebGL 2 through three.js: `MeshStandardMaterial`, `PCFShadowMap`, PMREM
  `RoomEnvironment`, vertex colours, `InstancedMesh`, `onBeforeCompile` shader
  patches.
- Tests: Node's built-in `node --test`, six cases in two files (`sim.test.js`,
  `containment.test.js`).
- Browser QA: Playwright Core 1.63.0. `scripts/smoke-test.mjs` runs 18 checks;
  `views.mjs`, `perf-probe.mjs` and `reload-stress.mjs` cover visuals, draw-call
  budget and repeated startup.
- Production dependency: `three` 0.186.1 (MIT). Dev: `vite` 8.3.3 (MIT),
  `playwright-core` 1.63.0 (Apache-2.0).
- Node 20.19+ or 22.12+. Build uses a relative base, so it can be hosted anywhere.
- No `LICENSE` file; `package.json` is `private`.

## Techniques

- The water is a damped 2D wave equation with a restoring term. Neighbour
  coupling propagates waves, border and island cells are pinned, and the pull
  toward zero turns a ripple into a slow global wobble. A fixed 60 Hz
  accumulator keeps it frame-rate independent (`src/sim/waveGrid.js`).
- `activity` is the smoothed mean absolute water velocity. It is the single
  scalar that drives fish fear and a small opacity change, and its thresholds
  were calibrated by running the grid in Node against click and orbit scenarios
  (`docs/ARCHITECTURE.md#calibration`).
- One interaction hub owns all reaction state. `JellyState` turns camera motion
  into three damped springs and exposes an `impulse` event; ocean, island, palms
  and fish subscribe. There is only one pointer and one camera listener
  (`src/sim/jellyState.js`).
- The island squash and shear live in the vertex shader. A distance-to-glass mask
  fades the effect to zero at the walls, so nothing pokes through, and the same
  patch on `customDepthMaterial` keeps the shadow correct
  (`src/world/island.js`).
- `bake()` merges static meshes into one geometry, multiplying each material
  colour into vertex colours. The scene drops from about 820 to about 360 meshes
  and stays near 620 draw calls including the shadow pass (`src/util/bake.js`).
- The closed skirt is what makes a cut-away view honest. Without it, the water
  walls reveal the hollow underside of the height field
  (`src/sim/islandShape.js`, `skirtGeometry`).
- Every derived colour is defined relative to a base colour with an HSL offset.
  The defaults reproduce the hand-tuned shades exactly, and a picked base colour
  gets a matching shallow, deep, wet-sand and highlight set (`src/theme.js`,
  `rel`).
- Fish steering combines wander, heading inertia, loose schooling with three
  deterministic neighbours, preferred depth, island avoidance through the height
  gradient, wall avoidance and a stay-under-surface rule
  (`src/world/fish.js`).
- Time is monotonic. Negative deltas are clamped, the rally index uses a safe
  modulo, and the frame loop has a `try/catch` that counts errors instead of
  dying. A negative timestamp once froze the rally on refresh
  (`src/main.js`, `docs/ARCHITECTURE.md`).
- Startup awaits `renderer.compileAsync`, then starts the loop. `pagehide`
  releases the WebGL context, `webglcontextlost` pauses with a notice and
  restores or reloads, and a back/forward-cache restore reloads the page
  (`src/main.js`).
- Glass and water are drawn in a fixed order with depth writes off for glass, and
  additive streak planes fake reflections (`src/world/showcase.js`).
- `window.__JELLY__.advance(seconds)` steps the simulation without rendering,
  because software WebGL runs near 1 fps. The smoke test uses it for every
  time-based assertion (`scripts/smoke-test.mjs`).

## Reusable pieces

| Piece | Kind | Path | Interface (one line) | Capabilities | Readiness | Notes |
|---|---|---|---|---|---|---|
| Damped spring | module | `src/sim/spring.js` | `new Spring(k, c, x?, v?)`, `step(dt, force?)`, `kick(dv)` | physics-sim | as-is | Semi-implicit Euler with sub-steps. Pure and tested for settling. |
| Jelly wave grid | module | `src/sim/waveGrid.js` | `new WaveGrid(cells, size, isSolid?)`, `ripple(x, z, strength?, radius?)`, `update(dt)`, `step()`, `activity` | physics-sim, threejs-scene | as-is | Typed arrays, no three.js. Tested for ripple, decay, solid cells and sane height. |
| Interaction hub | module | `src/sim/jellyState.js` | `new JellyState()`, `update(dt, camera, target)`, `onImpulse(fn)`, `impulse(point, strength, kind, object)` | physics-sim, animation-ui | extract | Uses three's `Vector3` and the camera. The one-hub-one-listener pattern is the reusable part. |
| Island height field | module | `src/sim/islandShape.js` | `islandHeight(x, z)`, `islandGradient(x, z)`, `LAYOUT` | procedural-generation, threejs-scene | extract | Analytic dome with a plateau and ripples. `LAYOUT` is this scene's placement contract. |
| Static mesh baker | module | `src/util/bake.js` | `bake(root, opts) -> Mesh` or `null` | threejs-scene | as-is-untested | Merges meshes and bakes material colour into vertex colours. No test, but a large measurable draw-call win. |
| Relative palette | module | `src/theme.js` | `rel(base, defaultBase, original)`, `loadTheme()`, `saveTheme(theme)` | design-tokens | as-is-untested | HSL-offset derivation plus best-effort storage. Four base colours. |
| Seeded RNG | module | `src/util/rng.js` | `rng(seed) -> {range, pick, ...}` | procedural-generation | as-is-untested | Mulberry32. Small and dependency-free. |
| Canvas texture set | module | `src/fx/textures.js` | `stripeTexture`, `netTexture`, `ballTexture`, `plaqueTexture`, `streakTexture`, `woodTexture`, `blobShadowTexture` | canvas-render | extract | Every texture is drawn at runtime. Tied to the scene's colours and sizes. |
| Browser QA scripts | script | `scripts/smoke-test.mjs`, `scripts/views.mjs`, `scripts/perf-probe.mjs`, `scripts/reload-stress.mjs` | Playwright E2E, camera views, draw-call probe, reload stress | verify-harness | as-is-untested | A strong four-part QA loop for a slow WebGL scene. Needs a preview server for smoke. |
| Test hook | module | `src/main.js` (`window.__JELLY__`) | `state()`, `advance(s)`, `poke(x,y)`, `pokeWorld(x,y,z,kind)` | verify-harness | extract | Lets a test step time without rendering and poke a world point directly. |

## Commands and gates

| Command | What it proves |
|---|---|
| `npm test` | Six pure cases: spring settles, island shape, ripple activity and decay, pinned solid cells, containment inside the case |
| `npm run build` | A production bundle with a relative base |
| `npm run dev` | Serves the scene on `http://localhost:5273` |
| `npm run smoke` | Eighteen Chromium checks: readiness, click hit, sea activity, fish fear and decay, island squash, palm bend, people outside the jelly rig, colours, containment, negative-time survival, no console errors or three warnings; needs `npm run preview` on `:4273` |
| `npm run qa:views` | Renders the named QA camera set to `qa-output/` |
| `npm run qa:perf` | Reports draw calls, triangles and CPU/GPU cost per scene group |
| `npm run qa:reload` | Refreshes many times; every load must become ready and keep animating |
| `npm run preview` | Serves `dist/` on `http://localhost:4273` |

The strongest gate is `npm run smoke` plus `qa:reload`; `npm test` covers only
the pure simulation.

## Related projects

- `crack-bloom` is the sibling three.js scene, with the same Vite + vanilla JS
  structure, a test hook, QA views, a smoke test and the no-binary-assets rule.
- `quick-mosaic` is the other visual experiment, but it uses Canvas 2D and a
  React UI.
- `chabulab-tools` hosts the maintained browser tools; no code is shared.

## Known gaps

- Only six unit tests cover the pure modules. The renderer, fish behaviour,
  people rig and colour derivation are proven only by the browser smoke test.
- `npm run smoke` needs a separately running preview server and Chromium, so it
  is easy to skip. It writes screenshots to `smoke-output/`.
- Software WebGL renders about 1 fps; every time-based check must use
  `__JELLY__.advance()`, and the scene is not pleasant on a machine without a GPU.
- Colour persistence is best effort. A blocked `localStorage` silently keeps the
  defaults.
- The UI is English only. The page colours change through CSS variables, but
  there is no theme beyond the four pickers.
- No deploy config, no CI and no `LICENSE`; the package is `private`.
