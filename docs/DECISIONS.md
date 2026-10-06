# Decisions and next steps

## Why this way
- **three.js, no framework.** One canvas, one loop; React would only add indirection.
- **CPU wave grid instead of a shader.** Needs readback-free access to "how violent is the sea" (fish fear), reflection off the island, and unit tests in Node. 97x97 vertices is cheap.
- **Matrix jiggle for the island** (squash + shear) instead of vertex animation: tiny cost, naturally "slight", and people (not parented) are provably unaffected.
- **Springs everywhere + one shared state.** `JellyState` is the only thing that knows about camera/pointer; everything else subscribes. Adding a new jiggly thing is ~20 lines.
- **Fear from physics, not a flag.** Fish read `grid.activity`, so anything that moves the water (clicks, orbiting, a future "storm") scares them consistently, and they calm down as the jelly settles.
- **Everything procedural, no assets.** Reproducible by any agent without downloading models; repo stays tiny.
- **Canvas background via CSS gradient** (`alpha: true`) instead of a sky dome - cheap and the showcase reads clearly.
- **Transparent glass without transmission.** Real transmission needs an extra render pass and fights with the transparent water; opacity + additive streaks looks close enough.

## Known limitations
- Water walls are plain planes; the sea top edge is pinned to the walls (no meniscus).
- Fish do not avoid each other perfectly; they use 3 fixed neighbours for speed.
- The island is not parented to people, so a 3% squash can make feet float/sink by ~0.03 units. Acceptable at this scale.
- Software GL (headless) renders only a few fps; use `window.__JELLY__.advance()` for time-based tests.
- Single pointer touch handled by OrbitControls; no multi-touch poke.

## Ideas
Sound (squelch on click, ambient waves), a day/night toggle, boats or a jellyfish, a `?storm` auto-excitation mode, an instanced-mesh crowd, GPU shader port of the wave grid, GitHub Pages deploy workflow.
