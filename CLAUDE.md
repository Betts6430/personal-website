# CLAUDE.md

Personal portfolio site for Avery Bettesworth, built as a set of scenes,
one per page, each themed on one of his interests and each carrying real
portfolio content. Scrolling never moves a page; it drives the scene.

- `index.html`, the mountain: a low-poly snowboarder carving down a ski
  hill toward a fixed camera (Three.js). Content panels fade in along the
  descent; the last carve ends in a hockey stop at 100% scroll, leaving
  the rider with his back to the lens and a contact bib pinned to his
  jacket. The user considers this scene finished; do not add to it
  (planned exception: pop-up trail signs linking to the other scenes).
- `projects.html`, the caravan: a fixed side-on view of an Arthurian army
  marching right-to-left across a warm sunrise plain, the city of Camelot
  in silhouette on the right. King Arthur leads out front with Excalibur
  raised; six banner-carts in distinct heraldic colors ride in the host,
  and as each crosses a fixed screen line it brings up that project's card
  in the open sky on the left. No project is crowned "best": the army just
  keeps marching. (Replaced an earlier Hall of Legends concept.)

Scrolling up rewinds everything, on every page.

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

The core invariant, on every page: every visual is a pure function of the
eased scroll fraction p in [0, 1]. No accumulated state depends on scroll
history, so any p always renders the same frame and reverse-scrolling just
works. Keep it that way.

Each scene is a separate Vite entry (`build.rollupOptions.input` in
vite.config.js) with its own Three.js world, timeline, and stylesheet, so
scenes never couple to each other. Only `src/scroll.js` is shared.

### The mountain (index.html, src/)

- `index.html` - fixed full-viewport canvas, an invisible 600vh
  `#scroll-space` spacer (native scrolling stays intact), content panels
  with `data-start`/`data-end` timeline ranges, and the `#bib` contact card.
- `src/scroll.js` - scroll position to eased 0..1 timeline (exponential
  smoothing in the render loop, not CSS). Shared by all scenes.
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
  mountain silhouettes, snowfall points, gulls crossing the sky, a
  chairlift gliding up the left flank (instanced pylons and merged-geometry
  chairs on 1px cables, mid-to-far ground only so the fog swallows it),
  spindrift gusts streaming across the run (GPU-only: the vertex shader
  computes each wisp from elapsed time via SNOW_Y_GLSL, a GLSL twin of
  surfaceY that must stay in sync with world.js), and sparse snow-sparkle
  glints twinkling near the camera. All ambience is a pure function of
  elapsed time, like the snow.
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
  wall, tinted trough, so it reads as carved snow, not a painted stripe;
  contrast and lip taper with distance up the run), prebuilt from `poseAt`
  and revealed with `drawRange` so it un-draws on reverse scroll. One
  deliberate stateful exception: rings revealed while the rider is mid-
  trick are sunk out of sight (no track where the board was airborne);
  un-drawing them on reverse scroll restores them, so the gap heals when
  that stretch is ridden again.
- `src/spray.js` - fixed-pool ring-buffer particles.
- `src/doodle.js` - snow doodles: while the mouse button is held, the
  pointer is projected onto the snow surface analytically; dragging kicks
  up plumes (its own spray pool) and presses an embossed carve line into
  the snow that fades in seconds. Each pen-stepped sprite knows its stroke
  direction: the shader projects it to screen space and draws a shadow
  ribbon on the sun side and a highlight ribbon opposite, so overlapping
  dots fuse into one groove that reads as pressed into the snow. Dot alpha
  is normalized by on-screen dot density (receding strokes pack dots into
  few pixels and would otherwise saturate), and single-frame pen jumps
  past MAX_SEG restart the stroke instead of laying sparse beads. Everything is transient and time-based, so the
  pure-function-of-p invariant holds. Touch is ignored (drags scroll).
- `src/sections.js` - panel opacity/slide from timeline ranges.

Easter eggs (all transient click or timer reactions, so the scroll
invariant holds and the scene is identical until someone finds them). A
console greeting in main.js hints at all three: drawing a doodle loop
around the rider makes him wave (world-space winding check in main.js
`onStrokeEnd`, `wave` param in rider.js `update`); one pine in the left
forest wears a slowly turning star (`createOddTree`) and erupts its
whole snow load in a ballistic flake burst when clicked (pointer cursor
on hover; the burst is its own particle pool, replayed as a pure
function of time since the click); and a
yeti (`createYeti`) steps out from behind a lone pine on the right flank
`YETI_DELAY` seconds after load and every `YETI_PERIOD` after that.

Fallbacks: `prefers-reduced-motion` or WebGL failure adds
`body.static-mode` (see styles.css), which turns the site into a plainly
scrolling document with one static rendered vista. When a renderer exists
(the reduced-motion case), `body.can-animate` also reveals `#play-ride`,
an explicit opt-in button that boots the animated ride. Renderer creation
retries without antialiasing before giving up; browsers with WebGL
disabled (common in in-app browsers) keep the static document. When
diagnosing "no animations" reports, these two branches are the suspects.
The caravan mirrors both branches (`#play-tour` in src/caravan/main.js).

### The caravan (projects.html, src/caravan/)

A fixed, side-on camera watches an Arthurian army march right-to-left along
a road at sunrise; the camera never moves (a site-wide rule now), so the
motion comes from the column crossing the frame and any sense of "arrival"
from the warm light, not from camera travel. The palette is a warm,
near-monochrome silhouette: an amber sky, everything on the ground a dark
warm brown rimmed by the low sun. The one gradient in the whole scene is
the sky.

- `projects.html` - same skeleton as index.html: fixed canvas, an
  invisible `#scroll-space` spacer, and content panels. The intro panel is
  a small "Projects" signpost; the six project cards are generated from
  data (see panels.js), not hand-written into the HTML.
- `src/caravan/world.js` - layout and math: the fixed-camera constants
  (`CAM`, `CAM_FOV`, `CAM_LOOK`, pitched up ~FOV/6 so the horizon sits ~1/3
  up the frame), `ROAD_Z` (the army's depth, set well back so it reads as a
  distant host), `ARTHUR_Z` (a nearer track so Arthur leads larger),
  `CAMELOT` and `SUN_DIR`, ground-height noise, seeded RNG, and the
  procession constants: `TRAVEL` (how far the column shifts over the
  scroll), `X_TRIG` (world X of the content trigger, ~25% in from the
  right), and `PROJECT_CROSS` (the eased-p at which each banner crosses it).
- `src/caravan/environment.js` - the static landscape, all flat colors: a
  rolling ground plane with a flat road corridor, a flat dirt road, two
  warm-brown ridge silhouettes, `buildCity` (a whole medieval skyline baked
  to two merged meshes, bodies + roofs, vertex-colored), `createSun` (a
  fog-exempt disc low by the city), and `createSky` (the gradient dome: a
  shader on a BackSide sphere centered on the camera, amber horizon
  deepening upward, warm glow toward the sun). `SKY_HORIZON` is exported
  for the fog color.
- `src/caravan/column.js` - the procession. The bulk is an INSTANCED crowd
  (`makeCrowd`): one merged pike-soldier silhouette instanced ~180 times
  (the row of pikes reads as a host) in one draw call. Featured units are
  individual groups: cavalry (`makeHorse`), supply and banner carts
  (`makeCart`), and `makeArthur` (mounted, gold crown + bright Excalibur +
  cape, scaled up, on the nearer track). The whole column advances with the
  scroll, `worldX(unit) = x0 - TRAVEL * p`, a pure function of p, so reverse
  scroll rewinds it and each banner crosses `X_TRIG` at a deterministic p.
  The gait (legs, wheels, body bob) is driven by distance travelled
  (`worldX * STRIDE_K`), NOT elapsed time, so it freezes when the scroll is
  held; only the flags flutter on time (wind). Banner-carts fly a flat,
  unlit flag in each project's `flag` color so the cue stays vivid against
  the silhouettes.
- `src/caravan/projects.js` - the six real projects as data (title, blurb,
  bullets, stack, links, tag, and a heraldic `flag` color). Single source
  of truth for both the banner colors and the cards (the content preserved
  from the scrapped hall).
- `src/caravan/panels.js` - `buildProjectPanels()` generates the six
  `.panel.project` cards into `#sections` from `projects.js`, each keyed to
  its banner's crossing (`data-start = PROJECT_CROSS[i]`, `data-end` = the
  next crossing). Cards are large, fill the open sky on the left, and hold
  the full write-up (a media slot for photos/clips added later, blurb,
  feature bullets, stack, links), with a color chip echoing the banner.
- `src/caravan/sections.js` - panel opacity/slide from timeline ranges (a
  local copy of the mountain's; scenes never couple).
- `src/caravan/main.js` - renderer, the fixed camera (set once and on
  resize), a warm dim hemisphere fill plus a low warm directional backlight
  (rims the silhouettes and throws long shadows toward the camera), the
  frame loop (subtle sunrise shift, `column.update(p, elapsed)`), and the
  static-mode fallback (mirrors the mountain, `#play-tour`).

Pace: march speed is the `#scroll-space` height (taller = slower per-scroll)
and is decoupled from banner spacing (which is `TRAVEL`), so the
scroll-space height is the single "how fast do they march" dial.

## Design rules (user-mandated)

- Palettes are per scene: the mountain is white and icy blue only
  (`src/styles.css`); the caravan is a warm sunrise silhouette, an amber
  sky over near-black warm-brown land and figures
  (`src/caravan/styles.css`). Each scene keeps one restrained palette.
- No gradient blurs, no glassmorphism, and no em dashes anywhere,
  including site copy and this repo's docs. A real sky gradient is fine
  (it is not the frosted UI "gradient blur" the rule targets); gradients on
  the land are not, they muddy the flat colors.
- Flat colors, crisp 1px borders, flat-shaded low-poly geometry.

## Verifying changes

There is no test suite; verification is visual. Headless workflow that
works here: install `playwright-core` in a temp dir, launch the cached
Chromium (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`) with
`--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`, then
scroll to a fraction of max scroll, wait ~1.8s for the eased timeline to
settle, and screenshot. Check 0%, section midpoints, ~95%, and 100%.
Capture mid-motion (scroll then screenshot after ~300ms) to see spray.
The same workflow covers the caravan at /projects.html: a project's card is
up between its banner's crossing (`PROJECT_CROSS[i]`) and the next, so a
midpoint between two consecutive crossings lands a card cleanly.

## Deployment

- GitHub Pages via `.github/workflows/deploy.yml` (build + deploy on push
  to `main`). Live at https://betts6430.github.io/personal-website/.
  Vite `base: './'` keeps asset paths relative for the subpath.
- Git remote uses the `github-personal` SSH alias (authenticates as
  Betts6430). The default SSH key belongs to a different account
  (ualberta-baymax); do not push with it.
- `public/resume.pdf` is served at the site root as `resume.pdf`.
