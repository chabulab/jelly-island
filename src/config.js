/**
 * Single source of truth for dimensions and tuning knobs.
 * World units ~ "metres of showcase": the case is 10 x 10 on the floor.
 * Y is up. The calm sea surface is y = 0. The seabed is y = FLOOR_Y.
 */
export const CASE = {
  half: 5,        // water box spans x,z in [-half, half]
  floorY: -2.4,   // seabed / bottom of water
  waterY: 0,      // calm sea level
  topY: 4.3,      // underside of the glass lid
};

/** Ocean wave-grid simulation (see docs/ARCHITECTURE.md#jelly-model). */
export const WAVE = {
  cells: 96,          // N: grid is (N+1)^2 vertices
  stepHz: 60,         // fixed simulation rate
  wave: 0.22,         // neighbour coupling  (wave speed^2, in cells^2 / step^2)
  restore: 0.015,     // pull back to rest level -> global wobble / "jelly" feel
  damping: 0.992,     // per-step velocity damping (closer to 1 = jigglier)
  solidHeight: 0.12,  // cells where island height > this are solid (waves reflect off the island)
  clickStrength: 0.06,
  clickRadius: 0.8,   // world units
};

/** Fear thresholds for fish, measured on WaveGrid.activity (mean |velocity| of water cells). */
export const FEAR = {
  calm: 0.0003,       // below -> relaxed (calibrated with a node script: see docs/ARCHITECTURE.md#calibration)
  panic: 0.0014,      // above -> fully scared (a click peaks near 0.0017 and decays over ~10 s; hard orbiting ~0.01)
};

export const FISH = {
  count: 18,
  minY: -2.15,
  maxY: -0.32,
  bound: 4.55,
};
