import { defineConfig } from 'vite';

// base './' keeps the build relocatable (GitHub Pages sub-path, file://-ish hosting, etc.)
// Dedicated ports so this project doesn't fight other Vite apps over 5173 / 4173.
// If the port is taken Vite just tries the next free one (strictPort is off).
export default defineConfig({
  base: './',
  server: { port: 5273 },
  preview: { port: 4273 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
