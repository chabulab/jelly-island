# Architecture

## Stack
three.js 0.186 (`^0.186.1`), Vite 8, plain ES modules. No framework, no assets. Dev-only: `playwright-core` for the smoke test.

## Coordinate system and dimensions (`src/config.js`)
- Y is up. Sea level `y = 0`. Seabed `y = -2.4`. Water box spans `x, z in [-5, 5]`.
- Glass case is the water box + 0.25 margin, top at `y = 4.3`; pedestal underneath; plaques on all 4 sides.
- People are ~0.5 tall, palms 2.2-2.9 (about 1:5).

## Frame loop (`src/main.js`)
```
controls.update()            // OrbitControls with damping
jelly.update(dt, camera)     // camera motion -> shared springs + rotationSpeed
ocean.update(dt, t)          // wave sim step + rewrite vertex heights/colours/normals
island.update(dt)            // shader squash/shear uniforms
palms.update(dt, t)          // trunk bend chains, crown, fronds
people.update(t)             // pure time-based animation (NO jelly input)
fish.update(dt, t)           // steering + fear
props.update(dt, t)          // seaweed sway (with slosh), sandcastle flag
render
```
Loop details (`src/main.js`):
- `start()` first awaits `renderer.compileAsync(scene, camera)` (parallel shader compile, "Building the island…" overlay), then sets `__JELLY__.ready = true` and starts `renderer.setAnimationLoop(frame)`.
- Time is **monotonic**: negative timer deltas are clamped to 0 and `simTime` never decreases. (rAF timestamps can be earlier than a `performance.now()` read just before; negative time once crashed the volleyball rally and froze the app on refresh.)
- `frame()` is wrapped in try/catch: an exception is logged once and counted (`state().frameErrors`), the loop keeps running.
- GPU context lifecycle: on `pagehide` the renderer is disposed and the context released (`forceContextLoss`); on `webglcontextlost` the loop pauses with a "Restoring graphics…" notice, restores on `webglcontextrestored` (re-generating the PMREM environment) or reloads after 4 s; a page restored from the back/forward cache reloads.

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
`islandHeight(x, z)` is a pure analytic height field (dome with flattened plateau, plus small wave-made sand ripples on the underwater slopes). The surface mesh is built from it (140x140 grid, vertex colours: seabed, wet sand + wet line, mottled dry sand, grass blob, blue tint with depth).
**Closed sides:** a "cut-away" skirt (`skirtGeometry()`) runs along all four glass walls from the island's edge profile down to the seabed, coloured as wavy sand strata. Without it you could look through the water walls into the hollow underside of the height field. The water-wall planes sit 1.2 cm outside the skirt so they never z-fight.
**Jiggle:** done in the vertex shader via `onBeforeCompile` (squash + shear about the seabed, uniforms `uShear`, `uSquash`). A mask `smoothstep(0, 1.8, distanceToGlass)` keeps the edges glued to the walls (no gaps, nothing pokes through the water walls). The same patch is applied to `customDepthMaterial` so shadows follow. Three springs (`px, pz, py`) drive the uniforms; direct hits wobble most.
`LAYOUT` in `islandShape.js` holds palm, towel, umbrella and court positions; objects are placed at `islandHeight` so they sit on the surface.

### Palms (`src/world/palms.js`)
Each palm: 9 chained trunk segments (each child of the previous one). Every segment is a lathe whose profile bulges under its top and pinches at the joint, with darker vertex colours at the scar, so the stack reads as a ringed coconut-palm trunk; the base segment has a root flare. Crown: a boss + 4-6 coconuts (baked into one mesh), 11 mature pinnate fronds (arching rachis with ~20 leaflet pairs hanging in a V, dark-to-light-to-yellow vertex colours; 3 shared geometry variants), 3 young upright fronds and 1 dead brown frond hanging down. Fronds are spread by the golden angle with random roll.
Springs: trunk bend X/Z (soft), crown X/Z (whippy, driven by trunk velocity), frond flap. Springs live in world space and are rotated into each palm's random Y rotation. A click on a palm kicks that palm hardest and its neighbours with distance falloff.

### People (`src/world/people.js`)
Toy-like but properly proportioned figures (~0.5 tall): lathe torso (waist/chest/shoulders, flattened), pelvis, two-part legs (thigh/knee/shin + foot) and arms (upper/elbow/forearm + hand), neck, head with eyes, nose and ears, hair styles (`short`, `long`, `pony`, `bun`, `curly`), sunglasses, sun hat or cap. Pivots: `legs[]`, `knees[]`, `arms[]`, `elbows[]`, `head`; the static parts of each pivot are baked into one mesh (`util/bake.js`).
Sunbathers lie on rounded towels with a pillow roll (one knee up / hands behind the head, breathing). Umbrella: scalloped 8-panel canopy with ribs, finial and two-tone pole. Court: blue tape lines, padded posts with caps, antennae, top band and cable, net texture. 4 volleyball players run a looping rally: ball parabola between the two hitters every 1.7 s; the receiver crouches (knees bend, hips drop), jumps and reaches up; the others hold a bouncing ready stance. **No access to JellyState** and not parented to the island.

### Fish (`src/world/fish.js`)
18 fish, 4 species with markings painted into vertex colours (clownfish bands with black edges, blue tang with dark saddle and yellow tail, butterflyfish eye band and tail spot, pink anthias gradient with a gold streak). Body: flattened lathe; forked tail, dorsal and anal fins from 2D shapes; flapping pectoral fins; eyes with pupils and glints. Body + dorsal + anal are baked into one mesh, each eye into one mesh.
Fish spawn at seeded positions in open water only (ground below -1.0, between the ground and the surface), so nothing starts on the island.
Steering = wander + heading inertia + loose schooling with 3 deterministic neighbours + preferred depth + island avoidance (look-ahead using the island height field gradient) + wall avoidance + stay under the surface.
Fear per fish: `target = smoothstep(activity, FEAR.calm, FEAR.panic)`; rises fast (rate 5), decays slowly (0.35). Clicks also startle fish within reach (burst away and down). Fear effects: max speed 0.55 -> 2.7, tail and pectoral beat faster, eyes x1.55, body blanches (emissive), dive to the bottom, head toward the island centre (shelter on its flanks), flee from the last click point, panicky jitter.

### Props (`src/world/props.js`)
Seeded (`util/rng.js`) so the layout is identical every load. Placement goes through `spotAtLevel(rng, groundLevel, margin)`, which walks out from the centre to the wanted ground height and retries other directions if it would reach the glass first, so nothing straddles the case wall. Shoreline rocks (jittered icospheres, in pairs), ~220 instanced grass tufts on the grass blob, flowering bushes, shells and starfish on the beach and seabed, a sandcastle with flag, bucket and spade, a cooler, flip-flops, coral clusters (branching / brain / tubes + fan) and seaweed ribbons. Everything static is baked into one mesh; seaweed sways on the CPU and sloshes with `jelly.sx/sz`; the flag flutters.

### Showcase (`src/world/showcase.js`)
Two-tier lacquered wood pedestal (canvas wood-grain texture, clearcoat), brass bands, a dark deck inside the glass 2 cm below the seabed, 4 rounded plaques with brass screws, transparent glass box (no depth write) with additive streak planes as fake reflections, a brass frame of rounded bars with ball finials (baked into one mesh), water-box wall planes with a turquoise-to-deep-blue vertical gradient, a shadow-catching floor plus a soft radial contact shadow. Render order: walls 1, ocean 2, glass 3, streaks 4.

### Colour theme (`src/theme.js`, pickers in `index.html`)
Four base colours (`sea`, `sand`, `grass`, `sky`). Every derived shade is defined *relative* to a base with
`rel(base, DEFAULT.base, originalShade)`: it keeps the HSL offset the hand-tuned shade had from the default base,
so the defaults reproduce the original look exactly and any picked colour gets a matching palette.
Recolouring hooks: `ocean.setSeaColor`, `showcase.userData.setWaterColor`, `island.setColors({sand, grass, sea})`
(surface + strata skirt + underwater tint), `props.setGrassColor` (instanced tufts), CSS variables
`--sky-core/--sky-mid/--sky-edge` for the page gradient. Choices persist in `localStorage` (best effort);
`window.__JELLY__.setColors({...})` does the same from scripts.

### Utilities
- `util/bake.js` - `bake(root, opts)` merges static child meshes into one mesh, baking each material colour into vertex colours. Use `deep: false` for animation rigs so child pivots stay separate. Cuts the scene from ~820 to ~360 meshes.
- `util/rng.js` - seeded PRNG (mulberry32) with `range` and `pick`.

### Rendering notes (three r186)
- `PCFSoftShadowMap` was removed in r186: we use `PCFShadowMap` + `shadow.radius`.
- `THREE.Clock` is deprecated since r183: the loop uses `THREE.Timer` (`timer.update(now)`).
- Lights: hemisphere + shadow-casting sun + a cool fill light from the opposite side; RoomEnvironment for reflections.
- Budget: ~620 draw calls per frame including the shadow-map pass (~365 meshes), ~190k triangles. Measure with `npm run qa:perf`. Fine on any discrete/Apple GPU; software GL (headless CI) renders ~1 frame/s, which is why tests use `__JELLY__.advance()`.

## Calibration
Fear thresholds depend on wave constants. Method used (node, no browser): build `WaveGrid(96, 10, isSolid)`, apply `ripple(...)`, step at 60 Hz, record peak `maxAbsHeight()` and `activity`. Results with the shipped constants:

| Scenario | peak height | peak activity |
| --- | --- | --- |
| One click, strength 0.06, radius 0.8 | ~0.35 | ~0.0017 (decays to < 0.0005 in 10 s) |
| Fast orbit, ripples of 0.012 * rot for 2 s | ~0.45 | ~0.010 |
| Slow orbit | ~0.07 | ~0.0018 |

So `FEAR.calm = 0.0003`, `FEAR.panic = 0.0014`. If you change `WAVE.*` or ripple strengths, redo this and update `config.js` + `tests/sim.test.js`.

## Testing
- `npm test` - Node tests: spring settles, island shape sanity, click scares fish then decays, solid cells pinned, and containment (every prop and palm mesh inside the water box).
- `npm run qa:reload` - refreshes the page N times (some mid-startup) and checks each load becomes ready and keeps animating with no frame errors or context loss.
- `npm run smoke` - Chromium E2E, 18 checks (incl. animation survives negative time, fish start in open water, colour pickers recolour + reset, everything inside the glass case): loads without console errors or three.js deprecation warnings, click on open water hits the ocean, activity/fear rise and decay, wave height sane, island squashes, palms bend, people not under the island in the scene graph, orbit registers. Writes `smoke-output/*.png`.
