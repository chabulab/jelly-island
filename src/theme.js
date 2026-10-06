import * as THREE from 'three';

/**
 * User-adjustable colours (the "Colors" pickers in the settings box).
 * Every derived shade (shallow/deep water, wet sand, grass highlights, sky edge...) is defined RELATIVE to
 * these base colours: `rel(base, DEFAULT.x, original)` keeps the HSL offset that `original` had from the
 * default base. So the defaults reproduce the hand-tuned look exactly and any picked colour gets a matching palette.
 */
export const DEFAULT_THEME = Object.freeze({
  sea: '#1fa3d0',
  sand: '#f7e7b6',
  grass: '#6cc152',
  sky: '#cdeeff',
});

const _a = {}, _b = {}, _c = {};
/** Shade of `base` that sits where `original` sat relative to `defaultBase` (HSL offset, hue wraps). */
export function rel(base, defaultBase, original, out = new THREE.Color()) {
  new THREE.Color(defaultBase).getHSL(_a);
  new THREE.Color(original).getHSL(_b);
  new THREE.Color(base).getHSL(_c);
  const h = (((_c.h + (_b.h - _a.h)) % 1) + 1) % 1;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return out.setHSL(h, clamp(_c.s + (_b.s - _a.s)), clamp(_c.l + (_b.l - _a.l)));
}

const KEY = 'jelly-island-colors';
export function loadTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_THEME, ...saved };
  } catch { /* storage unavailable: use defaults */ }
  return { ...DEFAULT_THEME };
}
export function saveTheme(theme) {
  try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch { /* ignore */ }
}
