import * as THREE from 'three';

/** Tiny canvas-texture helpers so the project needs no image assets. */
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export function stripeTexture(colors, count = 8, repeat = [1, 1]) {
  const [c, g] = canvas(256, 256);
  const w = 256 / count;
  for (let i = 0; i < count; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(i * w, 0, w + 1, 256); }
  return tex(c, { repeat });
}

export function netTexture() {
  const [c, g] = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 6); // top band
  return tex(c);
}

export function ballTexture() {
  const [c, g] = canvas(256, 128);
  const cols = ['#ffffff', '#ffd23f', '#3fa7ff'];
  for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 3]; g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128); }
  return tex(c);
}

export function plaqueTexture(text = 'JELLY ISLAND') {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#2b1a10'; g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#d9b36a'; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 108);
  g.fillStyle = '#f3d594';
  g.font = '700 64px ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.split('').join(' '), 512, 68);
  return tex(c);
}

/** Soft diagonal highlight used as a fake glass reflection. */
export function streakTexture() {
  const [c, g] = canvas(256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.32, 'rgba(255,255,255,0)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.46, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return tex(c);
}

/** Lacquered wood grain for the pedestal: long straight-ish fibres + a few broad colour bands. */
export function woodTexture() {
  const [c, g] = canvas(512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // broad bands
  for (let x = 0; x < 512; x += 4) {
    const v = 0.5 + 0.5 * Math.sin(x * 0.045) * Math.sin(x * 0.013 + 1.3);
    g.fillStyle = `rgb(${Math.round(98 + v * 26)},${Math.round(62 + v * 18)},${Math.round(38 + v * 10)})`;
    g.fillRect(x, 0, 4, 512);
  }
  // fibres: long, nearly straight, very gentle drift
  for (let i = 0; i < 420; i++) {
    const x0 = rnd() * 512, drift = (rnd() - 0.5) * 10, ph = rnd() * 6.28;
    g.strokeStyle = `rgba(${rnd() < 0.6 ? '45,25,14' : '160,112,72'},${0.05 + rnd() * 0.16})`;
    g.lineWidth = 0.5 + rnd() * 1.6;
    g.beginPath();
    for (let y = -8; y <= 520; y += 8) {
      const x = x0 + drift * (y / 512) + Math.sin(y * 0.006 + ph) * 2.2;
      y < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  return tex(c, { repeat: [1, 1] });
}

/** Soft radial blob used as a contact shadow under the pedestal. */
export function blobShadowTexture() {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grd.addColorStop(0, 'rgba(10,40,60,0.55)');
  grd.addColorStop(0.55, 'rgba(10,40,60,0.22)');
  grd.addColorStop(1, 'rgba(10,40,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return tex(c, { srgb: false });
}
