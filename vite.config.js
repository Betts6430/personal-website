import { defineConfig } from 'vite';

// Relative base so the built site works from any static host or subpath
// (GitHub Pages project sites live at /<repo>/, not /).
export default defineConfig({
  base: './',
});
