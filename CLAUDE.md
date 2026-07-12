# CLAUDE.md

Personal portfolio site for Avery Bettesworth. Scrolling does not move the
page; it drives a low-poly snowboarder carving down a ski hill toward a
fixed camera (Three.js). Content panels fade in along the descent; at 100%
scroll the rider hockey-stops with his back to the lens and a contact bib
is pinned to his jacket. Scrolling up rewinds everything.

## Commands

Node is installed via nvm and is NOT on the PATH in non-interactive shells.
Prefix every npm/node command with:

```
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

- `npm run dev` - dev server at http://localhost:5173
- `npm run build` - production build to `dist/`
- `npm run preview` - serve the production build

## Architecture

The core invariant: every visual is a pure function of the eased scroll
fraction p in [0, 1]. No accumulated state depends on scroll history, so
any p always renders the same frame and reverse-scrolling just works.
Keep it that way.

- `index.html` - fixed full-viewport canvas, an invisible 600vh
  `#scroll-space` spacer (native scrolling stays intact), content panels
  with `data-start`/`data-end` timeline ranges, and the `#bib` contact card.
- `src/scroll.js` - scroll position to eased 0..1 timeline (exponential
  smoothing in the render loop, not CSS).
- `src/world.js` - shared world math: SLOPE, run extents, `hillY`,
  `surfaceY`, `terrainNoise`, seeded RNG; `pathAt(p)` (sine carve path,
  amplitude tapers `(1 - 0.85p)` to stay in-frustum near the camera) and
  `poseAt(p)` (adds the finale: straighten, hockey stop, settle after
  `FINALE_START = 0.86`, rest at `STOP_Z`).
- `src/main.js` - renderer, camera, lights, frame loop `renderFrame(p, dt)`:
  rider transform, spray emission (rate scales with scroll speed x carve
  intensity), finale camera dolly, bib screen-space projection from the
  rider's back-panel anchors, and the static-mode boot branch.
- `src/environment.js` - hill mesh (vertex noise, flat riding corridor,
  vertex-color mottling), instanced pine forest, boulders, fog-exempt
  mountain silhouettes, snowfall points.
- `src/rider.js` - procedural rig from primitives; legs use analytic
  2-bone IK (ankles pinned to boots, knees solved); exposes
  `anchorTop`/`anchorBottom` for the bib.
- `src/trail.js` - full carve ribbon prebuilt from `poseAt`, revealed with
  `drawRange` so it un-draws on reverse scroll.
- `src/spray.js` - fixed-pool ring-buffer particles.
- `src/sections.js` - panel opacity/slide from timeline ranges.

Fallbacks: `prefers-reduced-motion` or WebGL failure adds
`body.static-mode` (see styles.css), which turns the site into a plainly
scrolling document with one static rendered vista.

## Design rules (user-mandated)

- White and icy blue only; palette lives in CSS vars in `src/styles.css`.
- No gradient blurs, no glassmorphism, and no em dashes anywhere,
  including site copy and this repo's docs.
- Flat colors, crisp 1px borders, flat-shaded low-poly geometry.

## Verifying changes

There is no test suite; verification is visual. Headless workflow that
works here: install `playwright-core` in a temp dir, launch the cached
Chromium (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`) with
`--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`, then
scroll to a fraction of max scroll, wait ~1.8s for the eased timeline to
settle, and screenshot. Check 0%, section midpoints, ~95%, and 100%.
Capture mid-motion (scroll then screenshot after ~300ms) to see spray.

## Deployment

- GitHub Pages via `.github/workflows/deploy.yml` (build + deploy on push
  to `main`). Live at https://betts6430.github.io/personal-website/.
  Vite `base: './'` keeps asset paths relative for the subpath.
- Git remote uses the `github-personal` SSH alias (authenticates as
  Betts6430). The default SSH key belongs to a different account
  (ualberta-baymax); do not push with it.
- `public/resume.pdf` is served at the site root as `resume.pdf`.
