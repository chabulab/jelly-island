# Visual QA: how problems are found and how models are polished

This is the working method used to review and improve Jelly Island. It answers three questions:
how to **see** the scene reliably, how to **detect** what is wrong, and how to **improve** a model without
breaking the style or the frame rate. Every rule below comes from a real problem in this repo (see the
case log at the end).

## 1. The loop

```
render named views  ->  inspect each image against its checklist  ->  list concrete defects
      ^                                                                      |
      |                                                                      v
 run smoke + perf  <-  fix one class of defect at a time (smallest change)  <-  prioritise
```

1. **Render** the fixed camera set: `npm run preview &` then `node scripts/views.mjs` (writes `qa-output/<view>.png`).
   Take a `PREFIX=before` set before changing anything so you can compare.
2. **Inspect** every image against the checklist for that view (section 3). Also watch the **first seconds after load**: spawn and initial-state bugs only show there. Look at the picture, don't trust
   that code "should" look right. Write defects down as *what / where / why it matters*.
3. **Prioritise**: anything that breaks the illusion (holes, see-through geometry, z-fighting, floating or
   buried objects, NaN/console errors) before polish; polish before nice-to-haves.
4. **Fix** one class of defect at a time, smallest change first (a colour or offset before new geometry).
5. **Re-render only the affected views** (`node scripts/views.mjs side,corner`) and compare with `before-*`.
6. **Gate**: `npm test`, `npm run smoke` (must be all PASS incl. *no console errors* and *no three.js
   deprecation warnings*), `node scripts/perf-probe.mjs` (no big jump in meshes / draw calls).
7. Refresh `docs/screenshots/` if the look changed, and record anything surprising in the case log below.

Software WebGL (headless CI, sandboxes) renders at ~1 frame/s: run `views.mjs` in the background, and use
`window.__JELLY__.advance(seconds)` for anything time-based instead of waiting on the clock.

## 2. The camera set (`scripts/views.mjs`)

Each view exists to expose a specific class of problem. Users can't reach some of these angles
(min orbit distance is 7), which is the point: QA must look where users *might* look.

| View | Looks at | Catches |
| --- | --- | --- |
| `default` | the whole case from the start camera | composition, colour balance, overall readability |
| `side` | through the water walls at sea level | hollow / open geometry, cross-section look, water depth tint |
| `corner` | glass corner + seabed | z-fighting (coplanar faces), gaps where things meet the walls |
| `under` | below the surface | fish markings, corals, seaweed, how washed-out the water is |
| `beach` | mid-range on the sand | relative scale of people / props / buildings, poses at a glance |
| `people` | close-up of players | faces, hands, feet, joint bends, clothing seams |
| `sunbath` | close-up of a lying figure | accessories that only make sense upright (hats, hair) |
| `palms` | low among the trees | trunk and frond quality, grass and bushes; ocean colour artefacts |
| `top` | straight down | layout overlaps, objects floating above or sunk into the ground |

## 3. What to look for (detection checklist)

**Geometry integrity**
- Can you see *into* or *through* anything that should be solid? (height fields, open cylinders, single-sided planes seen from behind)
- Flickering stripes or "chain-link" patterns on flat areas = two coplanar surfaces (z-fighting). Separate them by >= 1-2 cm.
- Objects floating above or sunk into the ground; things poking through glass or water walls while jiggling.
- Anything crossing the glass. This one is automated: `tests/containment.test.js` (props, palms) and the smoke check *everything stays inside the glass case* compare every mesh's world bounding box with the water box. Placement code must use `spotAtLevel()` / `insideCase()` in `props.js`, never a raw radius that can reach the wall.
- Anything that animates must stay sealed where it touches something static (fade the motion to 0 at the contact).

**Scale and proportion**
- Compare everything against a person (~0.5 units). A sandcastle as tall as a person, or a coral smaller than a fish, reads wrong immediately.
- Proportions of figures: head ~1/6.5 of height, limbs with visible knees/elbows, hands and feet present.

**Silhouette and shape**
- Squint at the image: does each object read from its outline alone? (A palm frond as a flat zig-zag strip does not; leaflets in a V do. A coral fan as a flat half-disc does not; radiating branches do.)
- Repetition: identical copies in a row look fake. Vary size, rotation, roll, colour with the seeded RNG.

**Colour and material**
- Saturated purple/black blotches on gradients = colour channels going negative or over 1 when adding highlights. Clamp.
- Washed-out or milky regions: too many stacked transparent layers or too-bright colours behind them. Prefer depth gradients (lighter/clearer at the top, denser/darker at the bottom) over one flat opacity.
- Procedural textures: look at them at the size they appear. Wavy grain that reads as crumpled paper is worse than plain colour.
- Flat single colours look like plastic: add a vertex-colour gradient (dark at the base, light at tips, lighter belly etc.).

**Pose and context**
- Accessories must match the pose (a hat on a lying head becomes a vertical disc: move it to the sand).
- Interacting things must line up (ball hits hands at the hitter's hand height, feet under the body when knees bend).

**Runtime health** (from the console and the smoke test)
- Any console error (e.g. `computeBoundingSphere(): radius is NaN` = NaN in a position buffer, usually `pow()` of a tiny negative number).
- three.js deprecation / removal warnings after upgrades (the smoke test fails on them).
- Debug readouts that cannot be right (an fps that never drops below 20 was computed from clamped dt).

## 4. How to improve a model (polish playbook)

Work from big to small, and stop when the object reads well at its normal viewing distance:

1. **Silhouette first.** Replace boxy primitives with shapes that carry the outline: `LatheGeometry` profiles for anything round (trunks, torsos, fish bodies), `ShapeGeometry` for fins and flat parts, custom strips for leaves.
2. **Proportion and articulation.** Fix sizes against the person scale; add the joints that poses need (knees, elbows) as pivot groups.
3. **Secondary detail that changes the outline**: ring scars on trunks, leaflets on fronds, scalloped umbrella edge, crenellations, finials. Skip detail that is invisible at viewing distance.
4. **Colour by vertex, not by texture.** Bake gradients and markings into vertex colours (species patterns on fish, strata on the island skirt, frond base-to-tip). Canvas textures only for things that are truly patterned (stripes, net, wood grain, plaque text).
5. **Variation**: seeded `rng()` for size, rotation, roll and colour picks; 2-3 geometry variants shared across many instances.
6. **Set dressing** for context and scale cues (shells, rocks, grass, a bucket next to a sandcastle). Put it where the eye goes, keep it out of gameplay areas (the court).
7. **Keep the style**: soft, toy-like, rounded, bright but not neon; no textures that look photographic.
8. **Pay the performance bill immediately**: `bake()` static parts (`deep: false` inside rigs), `InstancedMesh` for many identical items, `castShadow` only on things big enough to cast a visible shadow.

## 5. Performance

Run `node scripts/perf-probe.mjs`. It prints mesh / shadow-caster / triangle counts, draw calls, CPU ms per
subsystem update, and render time with each top-level group hidden in turn (the biggest drop is the most
expensive group). Budgets for this project: draw calls (incl. the shadow pass) under ~700 (currently ~620), triangles under ~250k, every CPU update
under ~5 ms. On software GL compare the *relative* numbers only.

## 6. Case log (problems found this way)

| Symptom seen | View | Cause | Fix |
| --- | --- | --- | --- |
| Empty space visible inside the island where it meets the glass | side, corner | island was a height-field *surface* only | cut-away strata skirt on all four walls; jiggle masked to 0 at the walls |
| Chain-link stripes on the seabed corners | corner, side | deck top coplanar with the island floor | deck lowered 2 cm |
| Purple blotches on the sea | palms | crest highlight pushed colours below 0 / above 1 | clamp vertex colours |
| Milky, washed-out underwater | side, under | flat 0.5 opacity water walls over bright sand | RGBA vertex-colour gradient walls; deeper underwater tint on the sand |
| Pedestal looked like crumpled paper | side | wavy procedural wood grain | straight fibres + broad colour bands |
| Sandcastle as tall as a person | beach | no scale check | scaled to 0.62 |
| Hat stood up like a halo | sunbath | upright accessory on a lying figure | hat moved onto the sand |
| Fan coral read as a flat lilac half-disc | under | flat circle geometry | radiating branches with knobbly tips |
| `computeBoundingSphere(): radius is NaN` | console | `pow(negative, 1.6)` in seaweed sway | clamp the base to >= 0 |
| Warnings after the three r186 upgrade | console | `PCFSoftShadowMap` removed, `Clock` deprecated | `PCFShadowMap` + radius, `THREE.Timer`; smoke test now fails on such warnings |
| ~820 meshes after adding detail | perf-probe | many tiny single-colour meshes | `util/bake.js` -> ~360 meshes |
| fps readout always >= 20 | debug panel | fps computed from clamped physics dt | use real elapsed time |
| Seashells / starfish / corals half outside the case (reported by the owner) | corner, side | `radiusAtLevel()` returned the wall radius when the island never reached the wanted depth in that direction | placement retries other angles and keeps a margin from the glass; containment unit test + smoke check |
| Fish on the island at load, sliding down into the sea | first seconds after load (reported by the owner) | spawn ring overlapped the island; the ground clamp then pushed them onto the sand | seeded rejection sampling in open water; smoke check "fish start in open water" |
