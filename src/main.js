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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} catch {
  renderer = null;
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

const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0005;
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
  // Riding, the body pitches with the slope; once the stop settles he
  // straightens up toward gravity-vertical so the bib hangs level.
  const settle = smoothstep((s.ft - 0.7) / 0.3);
  rider.group.position.set(s.x, s.y, s.z);
  rider.group.rotation.y = s.yaw;
  rider.group.rotation.x = SLOPE * (1 - 0.8 * settle);
  rider.group.rotation.z = s.lean;
  rider.update({ lean: s.lean, intensity: s.intensity, time: elapsed, rest: settle });

  trail.update(p);
  sections.update(p);

  // Spray. During the run: from the board's downhill edge, thrown toward
  // the outside of the turn. During the finale skid: a plowed burst thrown
  // toward the camera as the board whips sideways.
  if (s.skid > 0.05) {
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

  // Keep the shadow frustum tight on the rider wherever he is on the run.
  // Sun sits lower and to the side so terrain facets catch visible shading.
  sun.position.set(s.x + 45, s.y + 55, s.z - 35);
  sun.target.position.set(s.x, s.y, s.z);

  snowfall.update(elapsed);
  birds.update(elapsed);

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

// --- Boot: animated experience or static fallback ---------------------------------

if (renderer && !reducedMotion) {
  const timeline = createScrollTimeline();
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    renderFrame(timeline.update(dt), dt);
    requestAnimationFrame(frame);
  }
  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
} else {
  // Reduced motion or no WebGL: plainly scrolling document. If we can
  // render at all, hold one mid-run vista behind the content; the
  // static-mode stylesheet forces every panel and the bib visible.
  document.body.classList.add('static-mode');
  if (renderer) {
    renderFrame(0.5, 0.016);
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderFrame(0.5, 0.016);
    });
  }
}
