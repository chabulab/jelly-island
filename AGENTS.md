# AGENTS.md - working on Jelly Island

Read `README.md`, then `docs/ARCHITECTURE.md`. Short version:

## Commands
- `npm install` · `npm run dev` · `npm run build` · `npm test` (pure sim tests) · `npm run smoke` (browser E2E, needs a server on :4173).

## Rules
0. **Always use the latest stable version of every dependency** (owner's standing preference). Before adding or touching deps run `npm view <pkg> version` / `npm outdated`, install `@latest`, then `npm test && npm run build && npm run smoke`. Currently: three 0.186.x, vite 8.x, playwright-core 1.63.x.
1. **Tuning lives in `src/config.js`.** Do not scatter magic numbers for wave physics, fear thresholds, case size.
2. **`src/sim/*` stays free of three.js** (except `jellyState.js`, which only uses Vector3) so it remains unit-testable in plain Node. If you change wave physics, re-run the calibration (docs/ARCHITECTURE.md#calibration) and update `FEAR` in `config.js` and the tests.
3. **People must not jiggle.** `src/world/people.js` must never read `JellyState`, and must not be parented to the island or palms. `npm run smoke` checks the structural part.
4. **Interactions go through `JellyState`.** New reactive objects subscribe with `jelly.onImpulse(...)` and read the shared springs (`sx, sz, sy`, `rotationSpeed`, `strength`). Don't add a second pointer/camera listener.
5. **No binary assets.** Textures are canvas-drawn (`src/fx/textures.js`), geometry is procedural. Keep the repo tiny and reproducible.
6. **Coordinates:** Y up, sea level y=0, seabed y=-2.4, case is 10x10 centred on the origin. See `src/config.js`.
7. Verify visually, not just by build success: run the smoke test and look at the screenshots in `smoke-output/` (git-ignored).
8. Keep docs in sync: if behaviour or constants change, update `docs/ARCHITECTURE.md` in the same commit.

## Agent hook
The page exposes `window.__JELLY__` (`state()`, `advance(seconds)`, `poke(x,y)`, `pokeWorld(x,y,z,kind)`, plus the live scene objects). Use `advance()` for deterministic time-based checks; software-rendered browsers run at a few fps.
