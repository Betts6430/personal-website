import * as THREE from 'three';
import { createScrollTimeline } from './scroll.js';
import { createSections } from './sections.js';
import { SLOPE, hillY, poseAt, smoothstep } from './world.js';
import {
  buildHill,
  buildTrees,
  buildRocks,
  buildMountains,
  createSnowfall,
  createBirds,
  makeRoundTexture,
} from './environment.js';
import { createRider } from './rider.js';
import { createBibPin } from './bib.js';
import { buildTrail } from './trail.js';
import { createSpray } from './spray.js';
import { createSnowDoodle } from './doodle.js';

// ---------------------------------------------------------------------------
// The hill descends toward +Z. The camera sits near the bottom of the run;
// the rider starts far up-slope and carves down toward the lens, stopping
// with his back to the camera for the contact bib. All motion is a pure
// function of the 0..1 scroll timeline, so any scroll position always
// produces the same frame.
//
// If the visitor prefers reduced motion or WebGL is unavailable, the site
// falls back to a plainly scrolling document (body.static-mode) with at
// most one statically rendered frame behind it.
// ---------------------------------------------------------------------------

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('scene');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  // Some low-end devices refuse an antialiased context; try once more
  // without it before falling back to the static document.
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

// --- Scene / camera -----------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdcecf5);
scene.fog = new THREE.Fog(0xdcecf5, 60, 330);

const camera = new THREE.PerspectiveCamera(
  46,
  window.innerWidth / window.innerHeight,
  0.1,
  800,
);

// --- Lights -----------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0xffffff, 0xd7e8f2, 1.15));

// The sun is static, with a shadow frustum wide enough to hold the whole
// visible foreground (run, flank trees, rocks). A frustum that tracked the
// rider would make tree shadows pop in and out as the box moved with the
// scroll. Sun sits low and to the side so terrain facets catch shading.
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 40;
sun.shadow.camera.far = 450;
sun.shadow.bias = -0.0005;
sun.target.position.set(0, hillY(-100), -100);
sun.position.set(135, hillY(-100) + 165, -205);
scene.add(sun);
scene.add(sun.target);

// --- Environment, rider, trail, spray -------------------------------------------

scene.add(buildHill());
scene.add(buildTrees());
scene.add(buildRocks());
scene.add(buildMountains());

const snowfall = createSnowfall();
scene.add(snowfall.points);

const birds = createBirds();
scene.add(birds.group);

const rider = createRider();
// Slightly heroic scale so he reads clearly even at the top of the run.
rider.group.scale.setScalar(1.2);
scene.add(rider.group);

const trail = buildTrail();
scene.add(trail.mesh);

const spray = createSpray(makeRoundTexture());
scene.add(spray.points);

const doodle = createSnowDoodle(makeRoundTexture());
scene.add(doodle.group);

// --- Per-frame state --------------------------------------------------------------

const sections = createSections();
const bib = document.getElementById('bib');
const bibPin = createBibPin(bib);
// Size the anchor quad on the jacket to the card's rendered aspect ratio
// so the homography never has to stretch the content.
rider.layoutBib(0.34, (0.34 * bib.offsetHeight) / Math.max(bib.offsetWidth, 1));

let elapsed = 0;
let prevP = 0;
let sprayAcc = 0;
let lastP = 0;

// Click-the-rider tricks, layered on top of the scroll pose and driven
// purely by time since the click (transient, like the ambience). Spins and
// flips ease through exact full turns so the landing frame matches the
// plain scroll pose with no snap. Picked at random, never twice in a row.
const TRICKS = [
  { dur: 0.9, hop: 1.05, spin: 1, flip: 0, arch: 0, grab: 1 }, // ollie 360 grab
  { dur: 1.05, hop: 1.45, spin: 0, flip: 0, arch: 0.55, grab: 1 }, // method air
  { dur: 1.15, hop: 1.35, spin: 0, flip: 1, arch: 0, grab: 0.7 }, // backflip
];
let trick = TRICKS[0];
let trickIdx = 0;
let trickStart = -1e9;
let trickBurst = true;
let trickDir = 1;

const tangent = new THREE.Vector3();
const lateral = new THREE.Vector3();
const sprayOrigin = new THREE.Vector3();
const sprayVel = new THREE.Vector3();
const bibWorld = new THREE.Vector3();
const bibPts = {
  tl: { x: 0, y: 0 },
  tr: { x: 0, y: 0 },
  bl: { x: 0, y: 0 },
  br: { x: 0, y: 0 },
};

// Camera rig endpoints for the finale push-in.
const CAM_START = { y: hillY(16) + 3.5, z: 16 };
const CAM_END = { y: -0.45, z: 13.5 };
const LOOK_START = { x: 0, y: hillY(-90) + 2, z: -90 };
const LOOK_END = { x: 0, y: -0.55, z: 10 };

/** Advance the whole scene to timeline value p and render. */
function renderFrame(p, dt) {
  elapsed += dt;

  // How fast the timeline is actually moving (scroll speed), 0..1-ish.
  const speed01 = Math.min(1, (Math.abs(p - prevP) / Math.max(dt, 1e-4)) * 4);
  prevP = p;

  const s = poseAt(p);
  lastP = p;

  // Trick progress: hop arc plus this trick's mix of spin, flip, and arch.
  const tu = (elapsed - trickStart) / trick.dur;
  const air = tu > 0 && tu < 1 ? Math.sin(Math.PI * tu) : 0;
  const prog = tu > 0 && tu < 1 ? smoothstep(tu) : 0;
  const spin = trickDir * Math.PI * 2 * trick.spin * prog;
  const flip = -Math.PI * 2 * trick.flip * prog; // negative pitch = backflip
  if (!trickBurst && tu >= 0.96) {
    trickBurst = true;
    sprayOrigin.set(s.x, s.y + 0.05, s.z);
    sprayVel.set(2.4, 1.7, 0.7);
    spray.emit(sprayOrigin, sprayVel, 14);
    sprayVel.set(-2.4, 1.7, -0.7);
    spray.emit(sprayOrigin, sprayVel, 14);
  }

  // Riding, the body pitches with the slope; once the stop settles he
  // straightens up toward gravity-vertical so the bib hangs level.
  const settle = smoothstep((s.ft - 0.7) / 0.3);
  const pitch = SLOPE * (1 - 0.8 * settle) - trick.arch * air;
  rider.group.position.set(s.x, s.y + trick.hop * air, s.z);
  rider.group.rotation.y = s.yaw + spin;
  rider.group.rotation.x = pitch + flip;
  rider.group.rotation.z = s.lean;
  if (flip !== 0) {
    // The group origin is at the board, so a raw pitch rotation would orbit
    // the body around his feet. Offset the position so the flip pivots
    // around the chest instead and the board sweeps overhead.
    const h = 1.05; // approximate center of mass height, world units
    const oy = h * (Math.cos(pitch) - Math.cos(pitch + flip));
    const oz = h * (Math.sin(pitch) - Math.sin(pitch + flip));
    rider.group.position.y += oy;
    rider.group.position.x += oz * Math.sin(s.yaw + spin);
    rider.group.position.z += oz * Math.cos(s.yaw + spin);
  }
  rider.update({
    lean: s.lean,
    intensity: Math.max(s.intensity, 0.9 * air),
    time: elapsed,
    rest: settle,
    grab: trick.grab * air,
  });

  trail.update(p, air > 0.05);
  sections.update(p);

  // Spray. During the run: from the board's downhill edge, thrown toward
  // the outside of the turn. During the finale skid: a plowed burst thrown
  // toward the camera as the board whips sideways.
  if (air > 0.08) {
    sprayAcc = 0; // airborne mid-trick: the board is off the snow
  } else if (s.skid > 0.05) {
    sprayAcc += 480 * speed01 * s.skid * dt;
  } else {
    sprayAcc += 320 * speed01 * s.intensity * dt;
  }
  const n = Math.floor(sprayAcc);
  if (n > 0) {
    sprayAcc -= n;
    tangent.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
    lateral.set(tangent.z, 0, -tangent.x);
    if (s.skid > 0.05) {
      sprayOrigin.set(s.x, s.y + 0.05, s.z + 0.4);
      sprayVel.set(
        (Math.random() - 0.5) * 2.4,
        1.0 + 1.6 * speed01,
        1.2 + 2.2 * speed01 * s.skid,
      );
    } else {
      sprayOrigin
        .set(s.x, s.y + 0.05, s.z)
        .addScaledVector(lateral, s.outSign * 0.3)
        .addScaledVector(tangent, -0.7);
      sprayVel
        .copy(lateral)
        .multiplyScalar(s.outSign * (1.5 + 3.2 * speed01))
        .addScaledVector(tangent, 0.8 * speed01);
      sprayVel.y = 0.9 + 1.8 * speed01;
    }
    spray.emit(sprayOrigin, sprayVel, n);
  }
  spray.update(dt);

  // Finale camera push-in: drift from the wide run framing to an
  // over-the-shoulder shot of the jacket back.
  const dolly = smoothstep((s.ft - 0.5) / 0.5);
  camera.position.set(
    0,
    CAM_START.y + (CAM_END.y - CAM_START.y) * dolly,
    CAM_START.z + (CAM_END.z - CAM_START.z) * dolly,
  );
  camera.lookAt(
    LOOK_START.x + (LOOK_END.x - LOOK_START.x) * dolly,
    LOOK_START.y + (LOOK_END.y - LOOK_START.y) * dolly,
    LOOK_START.z + (LOOK_END.z - LOOK_START.z) * dolly,
  );

  snowfall.update(elapsed);
  birds.update(elapsed);
  doodle.update(camera, elapsed, dt);

  // Contact bib: project the four jacket anchors and warp the card onto
  // them once the stop is nearly settled, so it tracks the torso plane.
  const bibOpacity = smoothstep((s.ft - 0.8) / 0.15);
  if (bibOpacity > 0) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const key of ['tl', 'tr', 'bl', 'br']) {
      rider.bibAnchors[key].getWorldPosition(bibWorld).project(camera);
      bibPts[key].x = ((bibWorld.x + 1) / 2) * w;
      bibPts[key].y = ((1 - bibWorld.y) / 2) * h;
    }
    bibPin.update(bibPts.tl, bibPts.tr, bibPts.bl, bibPts.br);
  }
  bib.style.opacity = bibOpacity.toFixed(3);
  bib.style.pointerEvents = bibOpacity > 0.5 ? 'auto' : 'none';

  if (renderer) renderer.render(scene, camera);
}

// --- Pointer: powder doodles + click-the-rider trick -------------------------------

const pointerNdc = new THREE.Vector2();
const pointerRay = new THREE.Raycaster();
const riderScreen = new THREE.Vector3();

function pointerOnRider(clientX, clientY) {
  pointerNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    1 - (clientY / window.innerHeight) * 2,
  );
  pointerRay.setFromCamera(pointerNdc, camera);
  if (pointerRay.intersectObject(rider.group, true).length > 0) return true;
  // Forgiving radius so he is still clickable while small up-slope.
  riderScreen.copy(rider.group.position);
  riderScreen.y += 1;
  riderScreen.project(camera);
  const dx = ((riderScreen.x + 1) / 2) * window.innerWidth - clientX;
  const dy = ((1 - riderScreen.y) / 2) * window.innerHeight - clientY;
  return dx * dx + dy * dy < 48 * 48;
}

function onPointerMove(e) {
  doodle.onPointerMove(e);
  if (e.pointerType === 'touch') return;
  const overUi = e.target instanceof Element && e.target.closest('.panel, #bib, a, button');
  document.body.style.cursor =
    !overUi && pointerOnRider(e.clientX, e.clientY) ? 'pointer' : '';
}

function onPointerDown(e) {
  if (e.target instanceof Element && e.target.closest('.panel, #bib, a, button')) return;
  doodle.onPointerDown(e);
  if (elapsed - trickStart < trick.dur * 1.35) return; // let the last one land
  const s = poseAt(lastP);
  if (s.ft > 0.35) return; // no spinning once the stop is underway
  if (!pointerOnRider(e.clientX, e.clientY)) return;
  // Step to one of the other two tricks at random so repeat clicks always
  // get some variety.
  trickIdx = (trickIdx + 1 + Math.floor(Math.random() * 2)) % TRICKS.length;
  trick = TRICKS[trickIdx];
  trickDir = s.lean >= 0 ? 1 : -1; // spin into the turn
  trickStart = elapsed;
  trickBurst = false;
}

// --- Boot: animated experience or static fallback ---------------------------------

let animated = false;

function bootAnimated() {
  animated = true;
  const timeline = createScrollTimeline();
  const clock = new THREE.Clock();

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', doodle.onPointerUp);
  window.addEventListener('pointercancel', doodle.onPointerUp);

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
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (!animated) renderFrame(0.5, 0.016);
});

if (renderer && !reducedMotion) {
  bootAnimated();
} else {
  // Reduced motion or no WebGL: plainly scrolling document. If we can
  // render at all, hold one mid-run vista behind the content and reveal
  // the #play-ride control; motion the visitor asks for by name is fine
  // even under prefers-reduced-motion.
  document.body.classList.add('static-mode');
  if (renderer) {
    document.body.classList.add('can-animate');
    renderFrame(0.5, 0.016);
    document.getElementById('play-ride').addEventListener('click', () => {
      document.body.classList.remove('static-mode', 'can-animate');
      window.scrollTo(0, 0);
      bootAnimated();
    });
  }
}
