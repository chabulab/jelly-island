# Architecture

## Stack
three.js 0.170 (pinned `~0.170.0`), Vite 8, plain ES modules. No framework, no assets. Dev-only: `playwright-core` for the smoke test.

## Coordinate system and dimensions (`src/config.js`)
- Y is up. Sea level `y = 0`. Seabed `y = -2.4`. Water box spans `x, z in [-5, 5]`.
- Glass case is the water box + 0.25 margin, top at `y = 4.3`; pedestal underneath; plaques on all 4 sides.
- People are ~0.46 tall, palms 2.2-2.9 (about 1:5).

## Frame loop (`src/main.js`)
```
controls.update()            // OrbitControls with damping
jelly.update(dt, camera)     // camera motion -> shared springs + rotationSpeed
ocean.update(dt, t)          // wave sim step + rewrite vertex heights/colours/normals
island.update(dt)            // matrix squash/shear
palms.update(dt, t)          // trunk bend chains, crown, fronds
people.update(t)             // pure time-based animation (NO jelly input)
fish.update(dt, t)           // steering + fear
render
```
Click handling: `pointerdown/up` (moved < 6px and < 450 ms = click) -> raycast against ocean, island, palms ->
`jelly.impulse(point, strength, kind, object)`.

## Jelly model
`src/sim/jellyState.js` is the hub. Inputs: camera orbit/tilt/zoom speed and clicks. Outputs:
- `sx, sz, sy` - three global damped springs. Orbiting kicks `sx/sz` along the camera-right tangent (the contents "lag" behind the glass); tilting/zooming kicks `sy`.
- `rotationSpeed` - smoothed rad/s of camera motion.
- `impulse()` event with listeners: ocean (ripple), island (squash/shear), palms (bend), fish (startle).
- `strength` - the Jelliness slider multiplier.

### Ocean (`src/sim/waveGrid.js`, `src/world/ocean.js`)
96x96 cell grid, fixed 60 Hz steps (accumulator, so frame-rate independent):
```
v += (laplacian(h) * WAVE.wave) - h * WAVE.restore ; v *= WAVE.damping ; h += v
```
- The *restore* term (pull toward 0) turns a plain wave equation into gelatin: the whole surface keeps wobbling in slow standing modes instead of just rippling away.
- Border cells and island cells (`islandHeight > WAVE.solidHeight`) are pinned to 0, so ripples reflect off the glass and the island.
- Rendered height = `(idle sines + sim * gain + slosh tilt + lift) * edgeMask`. `edgeMask` fades to 0 within 0.9 of the walls so the surface always meets the wall tops.
- Orbiting sprinkles random rim ripples (probability and strength scale with `rotationSpeed`); clicks add one Gaussian dent.
- `grid.activity` = smoothed mean `|v|` of free cells = "how aggressively the sea is moving". It drives fish fear and slightly the surface opacity.
- Vertex colours: shallow-to-deep gradient from the island depth, white foam line at the shore, crests brighter / troughs darker each frame.

### Island (`src/world/island.js`, `src/sim/islandShape.js`)
`islandHeight(x, z)` is a pure analytic height field (dome with flattened plateau). The mesh is built from it (120x120 grid, vertex colours: seabed, wet sand, dry sand, grass blob, underwater blue tint). It jiggles via its **matrix** (`matrixAutoUpdate = false`): vertical squash up to 3% and shear up to 0.03 per unit height about the seabed. Three springs (`px, pz, py`), driven by the shared slosh springs and by impulses (direct hits wobble most).
`LAYOUT` in `islandShape.js` holds palm, towel, umbrella and court positions; objects are placed at `islandHeight` so they sit on the surface.

### Palms (`src/world/palms.js`)
Each palm: 6 chained trunk segments (each child of the previous one), a crown group, 9 drooping fronds with a zig-zag edge, 3 coconuts. Springs: trunk bend X/Z (soft), crown X/Z (whippy, driven by trunk velocity), frond flap. Top segments bend more (weight `(i+1)/6`). A click on a palm kicks that palm hardest and its neighbours with distance falloff.

### People (`src/world/people.js`)
Procedural figures (capsules/spheres) with limb pivots. Sunbathers lie on striped towels (breathing animation); 4 volleyball players run a looping rally: ball parabola between the two hitters every 1.7 s, the receiver jumps and swings arms up, the other player sways. **No access to JellyState** and not parented to the island.

### Fish (`src/world/fish.js`)
18 fish, 4 species palettes. Steering = wander + heading inertia + loose schooling with 3 deterministic neighbours + preferred depth + island avoidance (look-ahead using the island height field gradient) + wall avoidance + stay under the surface.
Fear per fish: `target = smoothstep(activity, FEAR.calm, FEAR.panic)`; rises fast (rate 5), decays slowly (0.35). Clicks also startle fish within reach (burst away and down). Fear effects: max speed 0.55 -> 2.7, tail beat rate up, eyes x1.55, colour paler, dive to the bottom, head toward the island centre (shelter on its flanks), flee from the last click point, panicky jitter.

### Showcase (`src/world/showcase.js`)
Wood pedestal, brass trim and frame, transparent glass box (no depth write), additive streak planes as fake reflections, water-box wall planes (the sea's side faces), shadow-catching floor. Render order: walls 1, ocean 2, glass 3, streaks 4.

## Calibration
Fear thresholds depend on wave constants. Method used (node, no browser): build `WaveGrid(96, 10, isSolid)`, apply `ripple(...)`, step at 60 Hz, record peak `maxAbsHeight()` and `activity`. Results with the shipped constants:

| Scenario | peak height | peak activity |
| --- | --- | --- |
| One click, strength 0.06, radius 0.8 | ~0.35 | ~0.0017 (decays to < 0.0005 in 10 s) |
| Fast orbit, ripples of 0.012 * rot for 2 s | ~0.45 | ~0.010 |
| Slow orbit | ~0.07 | ~0.0018 |

So `FEAR.calm = 0.0003`, `FEAR.panic = 0.0014`. If you change `WAVE.*` or ripple strengths, redo this and update `config.js` + `tests/sim.test.js`.

## Testing
- `npm test` - pure-Node tests: spring settles, island shape sanity, click scares fish then decays, solid cells pinned.
- `npm run smoke` - Chromium E2E, 13 checks: loads without console errors, click on open water hits the ocean, activity/fear rise and decay, wave height sane, island squashes, palms bend, people not parented to the island, orbit registers. Writes `smoke-output/*.png`.
