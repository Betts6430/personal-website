# CLAUDE.md

Personal portfolio site for Avery Bettesworth. Scrolling does not move the
page; it drives a low-poly snowboarder carving down a ski hill toward a
fixed camera (Three.js). Content panels fade in along the descent; the
last carve swoops across the frame and ends in a hockey stop at 100%
scroll, leaving the rider with his back to the lens and a contact bib
pinned to his jacket. Scrolling up rewinds everything.

## Commands

Node is installed via nvm and is NOT on the PATH in non-interactive shells.
Prefix every npm/node command with:

```
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

- `npm run dev` - dev server at http://localhost:5173 (Vite takes the next
  free port if that one is busy; check its startup output)
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
  `poseAt(p)` (adds the finale after `FINALE_START = 0.86`: the carve
  continues through the last arc, sweeping back to the centerline at p = 1,
  where a late yaw whip and skid turn it into the hockey stop at `STOP_Z`).
- `src/main.js` - renderer, camera, lights, frame loop `renderFrame(p, dt)`:
  rider transform, spray emission (rate scales with scroll speed x carve
  intensity), finale camera dolly, projecting the rider's four bib corner
  anchors to screen space for `src/bib.js`, and the static-mode boot branch.
  Also the pointer handlers: click-drag snow doodles (doodle.js) and the
  click-the-rider tricks (ollie 360 grab, method air, backflip; random,
  never twice in a row), layered on the scroll pose as a pure function of
  time since the click so spins and flips resolve to exact full turns.
- `src/bib.js` - warps the DOM contact card onto the projected jacket
  anchors with a matrix3d homography, so it foreshortens and sways with
  the torso plane like fabric pinned to the jacket. Race-bib styling
  (cloth tint, stitched dashed inset, snap pins) is `#bib` in styles.css;
  its size on the back is the `rider.layoutBib(...)` call in main.js.
- `src/environment.js` - hill mesh (vertex noise, flat riding corridor,
  vertex-color mottling), instanced pine forest, boulders, fog-exempt
  mountain silhouettes, snowfall points, and gulls crossing the sky
  (ambience is a pure function of elapsed time, like the snow).
- `src/rider.js` - procedural rig from primitives (octagonal-prism torso
  and hips, black helmet over a balaclava, wrap-around goggle arc, one
  continuous kicked board); legs and arms use analytic 2-bone IK (ankles
  pinned to boots, hands chase balance targets, knees/elbows solved);
  `update()` takes a `rest` factor that relaxes the pose for the finale
  stop and a `grab` factor for the mid-trick reach; exposes `bibAnchors`
  (four jacket-back corners) and `layoutBib()`
  to size them to the card's aspect ratio. Gear colors are the constants
  at the top of the file.
- `src/trail.js` - the carve track as a shallow V-groove (lit wall, shaded
  wall, tinted trough, so it reads as carved snow, not a painted stripe),
  prebuilt from `poseAt` and revealed with `drawRange` so it un-draws on
  reverse scroll.
- `src/spray.js` - fixed-pool ring-buffer particles.
- `src/doodle.js` - snow doodles: while the mouse button is held, the
  pointer is projected onto the snow surface analytically; dragging kicks
  up plumes (its own spray pool) and presses an embossed carve line into
  the snow (uniform pen-stepped sprites shaded to match the sun) that
  fades in seconds. Everything is transient and time-based, so the
  pure-function-of-p invariant holds. Touch is ignored (drags scroll).
- `src/sections.js` - panel opacity/slide from timeline ranges.

Fallbacks: `prefers-reduced-motion` or WebGL failure adds
`body.static-mode` (see styles.css), which turns the site into a plainly
scrolling document with one static rendered vista. When a renderer exists
(the reduced-motion case), `body.can-animate` also reveals `#play-ride`,
an explicit opt-in button that boots the animated ride. Renderer creation
retries without antialiasing before giving up; browsers with WebGL
disabled (common in in-app browsers) keep the static document. When
diagnosing "no animations" reports, these two branches are the suspects.

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
