# Avery Bettesworth, Personal Website

A portfolio site disguised as a ski run. Scrolling does not move the page:
it drives a low-poly snowboarder carving down a mountain toward the
camera. Content panels fade in along the descent, and the final carve
ends in a hockey stop with a contact card pinned to the rider's jacket
like a race bib.

**Live:** https://betts6430.github.io/personal-website/

Built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/),
no frameworks, no external 3D models. The rider, the forest, the whole
hill are procedural geometry built from primitives in code.

## The core idea

The page has an invisible 600vh spacer, so the browser scrolls natively,
but the only thing the scrollbar controls is a number: the timeline
fraction `p` in `[0, 1]`. A fixed full-screen canvas renders the scene,
and **every visual is a pure function of `p`**. There is no accumulated
simulation state, which means:

- Any scroll position always renders the exact same frame.
- Scrolling backward rewinds the world perfectly, including the carve
  trail, which un-draws itself.
- Refreshing mid-page resumes exactly where you were.

Raw scroll input is smoothed with exponential easing in the render loop
(`src/scroll.js`), which is what gives the rider his sense of momentum.

Ambient life (snowfall, gulls, the chairlift, wind gusts, snow sparkle)
follows a sibling rule: each is a pure function of elapsed *time*, so it
animates continuously without touching the scroll invariant. Transient
interactions (tricks, snow drawing) are pure functions of time since the
click, so they play out and resolve back into the scroll-driven pose.

## How the pieces fit

| File | What it does |
| --- | --- |
| `src/world.js` | Shared world math: slope, terrain noise, and `poseAt(p)`, the single source of truth for where the board is at any timeline value. The rider, trail, spray, and camera all derive from it, so they can never disagree. |
| `src/main.js` | Renderer, camera, lights, the per-frame `renderFrame(p, dt)`, pointer handling, and the trick system. |
| `src/scroll.js` | Scroll position to eased timeline. |
| `src/rider.js` | The procedural rider rig. Legs and arms use analytic two-bone IK: ankles pin to the boots, hands chase balance targets, knees and elbows are solved each frame. |
| `src/trail.js` | The carve track, prebuilt for the whole run as a shallow V-groove (lit wall, shaded wall) and revealed with `drawRange` as `p` advances. |
| `src/spray.js` | Fixed-pool ring-buffer particles for board spray. |
| `src/doodle.js` | Click and drag to draw in the snow. The pointer is projected onto the terrain analytically; dots carry their stroke direction so a shader shades each line like a carved groove. |
| `src/environment.js` | Hill mesh, instanced pine forest, boulders, mountain silhouettes, snowfall, gulls, chairlift, spindrift, sparkles. |
| `src/bib.js` | Projects the four corners of the rider's jacket panel to screen space and warps the DOM contact card onto them with a `matrix3d` homography, so real clickable links foreshorten and sway with the fabric. |
| `src/sections.js` | Fades content panels in and out from their timeline ranges. |

The finale (the last 14% of the scroll) remaps the carve into a
decelerating swoop that sweeps back to the centerline, whips into a
hockey stop, and settles while the camera dollies in over the rider's
shoulder to read the bib.

## Things to try

- **Click the rider** while he is carving: he throws one of three tricks
  (never the same one twice in a row).
- **Click and drag on the snow** to draw. Lines are embossed into the
  surface and fade after a few seconds.
- There are a few secrets. The browser console knows more.

<details>
<summary>Spoilers: the easter eggs</summary>

- Draw a closed loop around the rider and he waves back.
- One pine in the left forest wears a slowly turning star. Click it.
- Around a minute in, and every couple of minutes after, something
  furry peeks out from behind a lone pine at the right forest edge.

</details>

## Accessibility and fallbacks

If the visitor prefers reduced motion or WebGL is unavailable, the site
becomes a plainly scrolling document with a single static rendered
vista. When a renderer exists (the reduced-motion case), a visible
"play the ride" button offers the animation as an explicit opt-in.

## Development

```
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the production build
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push
to `main`.
