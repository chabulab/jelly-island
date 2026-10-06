import { defineConfig } from 'vite';

// base './' keeps the build relocatable (GitHub Pages sub-path, file://-ish hosting, etc.)
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
