# Reproducing this project

## 1. The original brief (verbatim intent)
> Build a showcase called "Jelly Island". Like the 3D showcases on the web, using libraries and web technologies only. A showcase sits at the centre that you can view and rotate around. Inside it are an island and an ocean with moving waves, but the ocean behaves like **jelly** when the user interacts with the showcase (rotating around or clicking). The island has some coconut trees and some people sunbathing and playing beach volleyball. The island and the coconut trees jiggle slightly with the user's interaction too, but **not the people**. Add some swimming fish in the ocean, and make them **scared when the sea is moving aggressively**. Create a folder under `~/projects/personal`, create a **private** GitHub repo with the `gh` CLI and push. Document everything so other agents can reproduce it.

## 2. Build recipe (what was done, in order)
1. `npm init`, add `three@latest`, `vite@latest`, dev `playwright-core`. Vite config with `base: './'`.
2. `index.html` (canvas + title + controls panel + hint + debug `<pre>`), `src/style.css` (CSS gradient backdrop, `alpha:true` renderer).
3. `src/config.js` constants; `src/sim/spring.js`, `islandShape.js`, `waveGrid.js` (pure JS) + `tests/sim.test.js`. Run `npm test`.
4. Calibrate wave strengths and fear thresholds with a node script (see ARCHITECTURE#calibration). Do this *before* writing the visuals; peak heights must stay < ~0.5 or the sea escapes the case.
5. `src/sim/jellyState.js`, then world modules in this order: `showcase.js`, `island.js`, `ocean.js`, `palms.js`, `people.js`, `fish.js`.
6. `src/main.js`: renderer (ACES tone mapping, PCF soft shadows, RoomEnvironment for reflections), OrbitControls with damping, hemisphere + directional light, click raycast, UI, loop, `window.__JELLY__`.
7. `scripts/smoke-test.mjs`. Iterate on look using screenshots; check the idle, after-click and top-down views.
8. `git init`, commit, `gh repo create jelly-island --private --source . --push`.

## 3. Verify
```bash
npm install && npm test && npm run build
npx playwright-core install chromium          # once, for the smoke test
npm run preview &                              # serves dist on :4273
npm run smoke                                  # expects 18 PASS; screenshots in smoke-output/
```
Look at `smoke-output/*.png`: the island with palms, players and sunbathers should be visible, the click screenshot should show a dent/ripples in the sea, and `fish fear` in the debug panel should be near 1.00 right after a click.

## 4. Gotchas hit while building (save yourself the time)
- **Restricted networks.** If `npm`/`gh` are blocked in your sandbox, build where they work (e.g. the user's machine) and verify there. A browser harness without a bundler also works: serve `src/` directly with an import map mapping `three` -> `node_modules/three/build/three.module.js` and `three/addons/` -> `node_modules/three/examples/jsm/` (newer three splits the core into `three.core.js` too: serve both from `build/`). Playwright's headless shell may lack system libs on minimal Linux (`libXdamage`...); use any machine with a working Chromium.
- **Software WebGL is slow** (~1-3 fps headless at 1280x800). Don't assert on wall-clock; use `window.__JELLY__.advance(seconds)`.
- **Wave heights are cumulative.** A single click impulse at strength 0.45 produced 1.2-2.0 unit surface spikes; the shipped 0.06 gives ~0.35. Always read `maxAbsHeight()` as well as activity when tuning.
- **`node --test tests/`** fails on Node 22 (treats the dir as a module); the script uses `tests/*.test.js`.
- **Glass:** keep `depthWrite: false` and set `renderOrder`, or the water/fish vanish behind it.
- **Shadows:** glass and water must not cast shadows (they don't set `castShadow`).
- **Never trust the clock:** a manual first `frame()` call + rAF timestamps gave a negative delta; time-derived indices (`leg % 2`) became -1 and threw, killing the loop on some refreshes only. Clamp deltas, keep time monotonic, use a safe modulo, and never let one frame's exception stop the loop.
- **Hollow height fields:** a height-field island seen through transparent walls exposes its empty underside. Close it with side skirts down to the seabed, and keep any jiggle at 0 near the walls.
- **Draw calls:** dozens of tiny single-colour meshes add up fast (people, props, fish). Bake static parts with `util/bake.js`.
- **fps readout:** count real elapsed time, not the clamped physics `dt` (an earlier version always showed >= 20 fps).
- **three r186:** `PCFSoftShadowMap` removed, `Clock` deprecated. The smoke test fails on three.js deprecation warnings so upgrades surface them.
- **Person pose:** lying figures rotate the whole person group `-PI/2` about X (head toward -Z, facing up).

## 5. Environment this was built in
macOS arm64, Node 24 (Linux VM shell reported Node 22), npm 10, three 0.186.1, vite 8.3.x, playwright-core 1.63. Browser checks ran in headless Chromium (software GL).
