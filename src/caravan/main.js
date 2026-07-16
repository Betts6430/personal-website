import * as THREE from 'three';
import { createScrollTimeline } from '../scroll.js';
import { createSections } from './sections.js';
import { buildProjectPanels } from './panels.js';
import { CAM, CAM_FOV, CAM_LOOK, smoothstep, groundY } from './world.js';
import {
  buildGround,
  buildRoad,
  buildHills,
  buildMountains,
  buildGrass,
  buildDeadTree,
  buildCity,
  createSky,
  createSun,
  SKY_HORIZON,
} from './environment.js';
import { createColumn } from './column.js';
import {
  createMotes,
  createSmoke,
  createFire,
  createBirds,
  createClouds,
  createDragon,
  createRoost,
} from './ambient.js';

// ---------------------------------------------------------------------------
// The caravan. A fixed, side-on camera watches an army march right-to-left
// along a road at dawn, Camelot standing on the far right. The camera never
// moves; the scroll drives the daybreak, warming the sky, fog, sun, and
// light from a cold pre-dawn to full sunrise. Every frame is a pure function
// of the eased 0..1 timeline.
//
// (This is the terrain-and-camera pass: the land, the road, the hills, the
// castle, and the dawn lighting. The marching column, the flag-cued project
// panels, and King Arthur at the head come next.)
//
// If the visitor prefers reduced motion or WebGL is unavailable, the site
// falls back to a plainly scrolling document (body.static-mode) behind one
// statically rendered dawn vista.
// ---------------------------------------------------------------------------

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('scene');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch {
    renderer = null;
  }
}
if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} else {
  canvas.remove();
}

// --- Scene / camera ----------------------------------------------------------

const scene = new THREE.Scene();
scene.background = SKY_HORIZON.clone();
// A light horizon haze only: it hides the far edge of the plain and warms the
// city's edges into the horizon band, but is kept far enough back that the
// foreground field and road stay crisp and saturated.
scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 150, 470);

const camera = new THREE.PerspectiveCamera(
  CAM_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  900,
);
// The camera is fixed for the life of the scene (a site-wide rule); only the
// light changes. Set it once here and again on resize.
camera.position.set(CAM.x, CAM.y, CAM.z);
camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z);

// --- Lights ------------------------------------------------------------------

// A dim, warm sky fill keeps the ground and figures dark so they read as
// silhouettes; the amber sky dome supplies the brightness instead.
const hemi = new THREE.HemisphereLight(0xffcf9a, 0x2a1c10, 0.55);
scene.add(hemi);

// The sun is a low, warm backlight from its own side (behind the city), so
// the city and army read as silhouettes with only their edges rimmed, and
// the marchers throw long shadows toward the camera.
const sun = new THREE.DirectionalLight(0xffcf90, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140;
sun.shadow.camera.right = 140;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 560;
sun.shadow.bias = -0.0005;
sun.position.set(60, 52, -320);
sun.target.position.set(0, 0, -38);
scene.add(sun);
scene.add(sun.target);

// --- Environment -------------------------------------------------------------

const sky = createSky();
scene.add(sky.mesh);

scene.add(buildGround());
scene.add(buildRoad());
scene.add(buildMountains());
scene.add(buildHills());
const city = buildCity();
scene.add(city.group);
scene.add(buildDeadTree());
const grass = buildGrass();
scene.add(grass.mesh);

const sunDisc = createSun();
scene.add(sunDisc.mesh);

const column = createColumn();
scene.add(column.group);

// --- Atmosphere: dust, smoke, campfire --------------------------------------

const motes = createMotes();
scene.add(motes.points);

// A roadside campfire (its flame motivates the nearest plume) plus a few of
// Camelot's chimneys smoking at dawn. The fire sits on the ground at its spot.
const FIRE_X = -18;
const FIRE_Z = -22;
const FIRE_Y = groundY(FIRE_X, FIRE_Z);
const fire = createFire(FIRE_X, FIRE_Y, FIRE_Z);
scene.add(fire.group);

const smoke = createSmoke([
  { x: FIRE_X, y: FIRE_Y + 0.9, z: FIRE_Z, height: 15, rate: 0.22, size: 2.4, spread: 1.3, wind: 0.16, count: 90, baseJit: 0.5 },
  { x: 52, y: 16, z: -184, height: 9, rate: 0.17, size: 1.6, spread: 0.8, wind: 0.22, count: 42 },
  { x: 64, y: 18, z: -186, height: 10, rate: 0.15, size: 1.7, spread: 0.8, wind: 0.22, count: 42 },
  { x: 71, y: 13, z: -183, height: 8, rate: 0.2, size: 1.4, spread: 0.7, wind: 0.22, count: 36 },
]);
scene.add(smoke.points);

// --- Living sky: birds, clouds, a periodic dragon ---------------------------

const birds = createBirds();
scene.add(birds.group);
const clouds = createClouds();
scene.add(clouds.group);
const dragon = createDragon();
scene.add(dragon.group);
const roost = createRoost();
scene.add(roost.group);

// --- Dawn -------------------------------------------------------------------

const SUN_COOL = new THREE.Color(0xffcf94); // low sunrise light
const SUN_WARM = new THREE.Color(0xffe9c6); // a touch warmer as it lifts

// Generate the project cards from the project data before the section driver
// reads them, so each is keyed to when its banner crosses the trigger.
buildProjectPanels();
const sections = createSections();

let elapsed = 0;
let bellTime = -999; // time of the last bell toll (city click)

/** Advance the whole scene to timeline value p and render. */
function renderFrame(p, dt) {
  elapsed += dt;

  const e = smoothstep(p);

  // The bell-toll ripple decays back to the resting wind over ~2.4s.
  const bellExcite = Math.max(0, 1 - (elapsed - bellTime) / 2.4);

  // The scene stays at sunrise; sky and light shift only subtly across the
  // scroll (the procession, added next, is what the scroll really drives).
  hemi.intensity = 0.5 + 0.1 * e;
  sun.intensity = 1.15 + 0.25 * e;
  sun.color.copy(SUN_COOL).lerp(SUN_WARM, e);
  sky.update(p);
  sunDisc.update(p);
  city.update(elapsed, bellExcite);
  grass.update(elapsed);
  motes.update(elapsed);
  smoke.update(elapsed);
  fire.update(elapsed);
  birds.update(elapsed);
  clouds.update(elapsed);
  dragon.update(elapsed);
  roost.update(elapsed);
  column.update(p, elapsed);

  sections.update(p);

  if (renderer) renderer.render(scene, camera);
}

// --- Boot: animated experience or static fallback ---------------------------------

console.log(
  '%c' +
    [
      '  |>   the host rides out from Camelot at sunrise.',
      '       scroll to follow the march.',
      '       click the city to toll the bells; click the king to catch the light.',
      '       and watch the skies.',
    ].join('\n'),
  'color:#c8892f',
);

// --- Interaction: waysigns / toll the bells / catch Excalibur's light -------
// A click on a trailing waysign leaves for that scene; a click on Camelot rings
// the bells (pennants whip, roosting birds burst off the towers, a warm bloom
// peals from the tower); a click on King Arthur flares a glint off Excalibur.
// The reactions are transient, time-since-click, so the scroll invariant on the
// world geometry is untouched.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pointAt(event) {
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}

/** The href of the sign under the pointer, or null. */
function signUnderPointer() {
  for (const s of column.signs) {
    if (s.mesh.parent && s.mesh.parent.visible && raycaster.intersectObject(s.mesh).length) {
      return s.href;
    }
  }
  return null;
}

canvas.addEventListener('click', (event) => {
  if (!animated) return;
  pointAt(event);

  // Waysigns first (a clear call to action), then Arthur, then the city.
  const href = signUnderPointer();
  if (href) {
    window.location.href = href;
    return;
  }
  if (raycaster.intersectObject(column.arthur, true).length) {
    column.glint(elapsed);
    return;
  }
  if (raycaster.intersectObject(city.group, true).length) {
    bellTime = elapsed;
    roost.scatter(elapsed);
  }
});

// Pointer cursor over anything clickable, so the interactions are discoverable.
canvas.addEventListener('pointermove', (event) => {
  if (!animated) return;
  pointAt(event);
  const over =
    signUnderPointer() !== null ||
    raycaster.intersectObject(column.arthur, true).length > 0 ||
    raycaster.intersectObject(city.group, true).length > 0;
  canvas.style.cursor = over ? 'pointer' : '';
});

let animated = false;

function bootAnimated() {
  animated = true;
  const timeline = createScrollTimeline();
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    renderFrame(timeline.update(dt), dt);
    requestAnimationFrame(frame);
  }
  frame();
}

window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  camera.position.set(CAM.x, CAM.y, CAM.z);
  camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (!animated) renderFrame(0.15, 0.016);
});

if (renderer && !reducedMotion) {
  bootAnimated();
} else {
  // Reduced motion or no WebGL: plainly scrolling document. If we can render
  // at all, hold one early-dawn vista behind the content and reveal the
  // #play-tour control; motion the visitor asks for by name is fine even
  // under prefers-reduced-motion.
  document.body.classList.add('static-mode');
  if (renderer) {
    document.body.classList.add('can-animate');
    renderFrame(0.15, 0.016);
    document.getElementById('play-tour').addEventListener('click', () => {
      document.body.classList.remove('static-mode', 'can-animate');
      window.scrollTo(0, 0);
      bootAnimated();
    });
  }
}
