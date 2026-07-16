import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Relative base so the built site works from any static host or subpath
// (GitHub Pages project sites live at /<repo>/, not /).
//
// Multi-page build: each scene is its own self-contained page with its own
// Three.js world and scroll timeline. index.html is the mountain,
// projects.html is the caravan (an Arthurian dawn march, src/caravan/).
// timeline.html is a static placeholder for the planned timeline scene, so the
// caravan's "Timeline" waysign always resolves to a real page.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        projects: fileURLToPath(new URL('./projects.html', import.meta.url)),
        timeline: fileURLToPath(new URL('./timeline.html', import.meta.url)),
      },
    },
  },
});
