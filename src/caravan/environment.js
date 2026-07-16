import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CAM,
  ROAD_Z,
  ROAD_HALF_W,
  CAMELOT,
  SUN_DIR,
  groundY,
  mulberry32,
  smoothstep,
} from './world.js';

// The static sunrise landscape the caravan crosses. A warm, near-monochrome
// silhouette palette: a glowing amber sky, and everything on the ground a
// dark warm brown that reads as silhouette with only the low sun rimming its
// edges. Flat colors everywhere; the only gradient in the whole scene is the
// sky, because any gradient on the land muddies it. Shading (flat-shaded
// facets catching the light) is not a gradient, so it stays.

// --- Palette ----------------------------------------------------------------
const GRASS = 0x53431f; // dark warm field, shadowed toward silhouette
const ROAD = 0x8f723d; // warm dust path
const CITY_STONES = [0x2a1c11, 0x342313, 0x21160b]; // warm dark-brown silhouette
const CITY_ROOF = [0x241708, 0x2b1d0d, 0x1d1308];
const RIDGE_NEAR = 0x2a1a0e; // warm dark hills, darker near
const RIDGE_FAR = 0x4a3316; // warmer/lighter far (aerial layering, flat steps)

// --- Ground -----------------------------------------------------------------

export function buildGround() {
  // Wide and deep enough that its edges sit outside the frustum or inside the
  // far haze. One flat green; the flat-shaded facets do all the variation.
  const geo = new THREE.PlaneGeometry(620, 420, 110, 72);
  geo.rotateX(-Math.PI / 2); // lie flat in local XZ
  geo.translate(0, 0, -140);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: GRASS, flatShading: true }),
  );
  ground.receiveShadow = true;
  return ground;
}

// --- Road -------------------------------------------------------------------
// A flat dust lane along X at the road depth, one clean color against the
// green so it reads without any blending.

export function buildRoad() {
  const geo = new THREE.PlaneGeometry(320, ROAD_HALF_W * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.05, ROAD_Z);

  const road = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: ROAD, flatShading: true }),
  );
  road.receiveShadow = true;
  return road;
}

// --- Hill silhouettes -------------------------------------------------------
// A couple of blue ridge lines between the road and the city, each a flat
// strip with a wavy crest. Flat color, no fade; the farther one is simply a
// lighter flat blue so the two read as layers.

function buildRidge(z, crestY, color, seed) {
  const rng = mulberry32(seed);
  const X0 = -320;
  const X1 = 320;
  const STEPS = 64;
  const base = -40; // skirt drops well below the horizon, hidden by nearer land
  const verts = [];
  const idx = [];

  const a1 = 6 + rng() * 4;
  const a2 = 2.5 + rng() * 2;
  const k1 = 0.012 + rng() * 0.006;
  const k2 = 0.03 + rng() * 0.02;
  const ph1 = rng() * 10;
  const ph2 = rng() * 10;

  for (let i = 0; i <= STEPS; i++) {
    const x = X0 + ((X1 - X0) * i) / STEPS;
    const top = crestY + Math.sin(x * k1 + ph1) * a1 + Math.sin(x * k2 + ph2) * a2;
    verts.push(x, base, z, x, top, z);
    if (i < STEPS) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

export function buildHills() {
  const group = new THREE.Group();
  group.add(buildRidge(-78, 7, RIDGE_NEAR, 21));
  group.add(buildRidge(-116, 12, RIDGE_FAR, 47));
  return group;
}

// --- Camelot (the city) -----------------------------------------------------
// A whole medieval skyline far down-frame on the right: a curtain wall with
// crenellations, packed rows of houses rising toward a cathedral and its
// spires, all in deep blue that reads mostly as a silhouette against the
// bright sky (the low sun rims its edges, so it is not solid black). It bakes
// down to two merged meshes so the crowd of buildings costs two draw calls.

export function buildCity() {
  const rng = mulberry32(8123);
  const pick = (arr) => arr[(rng() * arr.length) | 0];
  const bodies = [];
  const roofs = [];

  // One flat color per building (a small value jitter for skyline read), baked
  // to vertices so many buildings share one merged mesh. Flat, not a gradient.
  function paint(geo, hex, into) {
    const col = new THREE.Color(hex).offsetHSL(0, 0, (rng() - 0.5) * 0.04);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    into.push(geo);
  }

  const CW = 64; // city width (local x span)
  const CD = 20; // city depth
  const PLINTH = 5; // height of the mound the city stands on

  const plinth = new THREE.BoxGeometry(CW + 10, PLINTH * 2, CD + 10);
  paint(plinth, CITY_STONES[2], bodies);

  function building(x, z, w, d, h, roofH) {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, PLINTH + h / 2, z);
    paint(b, pick(CITY_STONES), bodies);
    if (roofH > 0) {
      const r = new THREE.ConeGeometry(Math.max(w, d) * 0.72, roofH, 4);
      r.rotateY(Math.PI / 4);
      r.translate(x, PLINTH + h + roofH / 2, z);
      paint(r, pick(CITY_ROOF), roofs);
    }
  }

  function spire(x, z, w, h, capH, sides = 6) {
    const b = new THREE.BoxGeometry(w, h, w);
    b.translate(x, PLINTH + h / 2, z);
    paint(b, pick(CITY_STONES), bodies);
    const c = new THREE.ConeGeometry(w * 0.66, capH, sides);
    c.translate(x, PLINTH + h + capH / 2, z);
    paint(c, pick(CITY_ROOF), roofs);
  }

  for (let row = 0; row < 4; row++) {
    const z = CD / 2 - 4 - row * 4.5;
    const baseH = 5 + row * 3.2;
    for (let x = -CW / 2 + 4; x < CW / 2 - 4; x += 4.2 + rng() * 2.4) {
      const w = 3 + rng() * 2.4;
      const h = baseH + rng() * 5;
      building(x + (rng() - 0.5) * 1.4, z + (rng() - 0.5) * 1.4, w, w, h, 2 + rng() * 2.6);
    }
  }

  spire(-4, -5, 8, 30, 15);
  spire(5, -6, 6, 25, 19);
  spire(0, -2, 5, 24, 26);

  for (const tx of [-CW / 2 + 1, -CW / 5, CW / 5, CW / 2 - 1]) {
    spire(tx, CD / 2 - 2, 4.5, 15 + rng() * 8, 6 + rng() * 4);
  }

  const wall = new THREE.BoxGeometry(CW, 9, 3);
  wall.translate(0, PLINTH + 4.5, CD / 2 + 1.5);
  paint(wall, CITY_STONES[0], bodies);
  for (let x = -CW / 2 + 1.5; x <= CW / 2 - 1.5; x += 3) {
    const m = new THREE.BoxGeometry(1.5, 1.6, 3);
    m.translate(x, PLINTH + 9 + 0.8, CD / 2 + 1.5);
    paint(m, CITY_STONES[0], bodies);
  }

  const bodyMesh = new THREE.Mesh(
    mergeGeometries(bodies),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
  );
  const roofMesh = new THREE.Mesh(
    mergeGeometries(roofs),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
  );
  // The city does not cast: a low backlight through all those spires throws
  // spiky streaks across the field. The marchers (added next) cast the
  // shadows that matter.
  bodyMesh.castShadow = false;
  roofMesh.castShadow = false;

  const group = new THREE.Group();
  group.add(bodyMesh, roofMesh);
  group.position.set(CAMELOT.x, groundY(CAMELOT.x, CAMELOT.z) - PLINTH + 1, CAMELOT.z);
  group.rotation.y = -0.32; // angle a front corner toward the camera
  return group;
}

// --- Sun --------------------------------------------------------------------
// A flat bright disc low on the right, fog-exempt so it stays luminous. It
// sits at sunrise and lifts only slightly across the scroll: the time of day
// is the setting, not the mechanic (the day-to-night change is reserved for
// the planned camp scene).

const SUN_LOW = new THREE.Color(0xfff1cf); // bright, warmer than the sky glow
const SUN_UP = new THREE.Color(0xfffbee); // a touch whiter as it lifts

export function createSun() {
  const mat = new THREE.MeshBasicMaterial({
    color: SUN_LOW.clone(),
    transparent: true,
    opacity: 0.95,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(12, 48), mat);
  mesh.position.set(SUN_DIR.x, 8, SUN_DIR.z);

  function update(p) {
    const e = smoothstep(p);
    mat.color.copy(SUN_LOW).lerp(SUN_UP, e);
    mesh.position.y = 8 + 5 * e; // lifts only a little; time is not the point
  }

  return { mesh, update };
}

// --- Sky --------------------------------------------------------------------
// The one gradient in the scene: a warm amber dome centered on the fixed
// camera. Bright gold hugging the horizon, deepening to a rich amber up top,
// with a concentrated glow over the sun. A real sky gradient is a different
// thing from the banned UI "gradient blur": it stays crisp and flat-lit.
// Colors shift only subtly across the scroll.

export const SKY_HORIZON = new THREE.Color(0xffc766);
const SKY_ZENITH = new THREE.Color(0x9c4f18);
const SKY_GLOW = new THREE.Color(0xffe6a0);

export function createSky() {
  const sunAz = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z - CAM.z).normalize();
  const uniforms = {
    uZenith: { value: SKY_ZENITH.clone() },
    uHorizon: { value: SKY_HORIZON.clone() },
    uGlow: { value: SKY_GLOW.clone() },
    uSunDir: { value: sunAz },
    uGlowAmt: { value: 0.65 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGlow, uSunDir;
      uniform float uGlowAmt;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.15, 1.0);
        // Gold hugs the horizon and deepens gradually to warm amber up top.
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.78, h));
        // Warm glow: strongest toward the sun's azimuth and low in the sky.
        vec3 dh = normalize(vec3(d.x, 0.0001, d.z));
        float az = max(dot(dh, uSunDir), 0.0);
        float low = 1.0 - smoothstep(0.0, 0.42, h);
        col = mix(col, uGlow, pow(az, 3.0) * low * uGlowAmt);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  mesh.position.set(CAM.x, CAM.y, CAM.z);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  function update(p) {
    uniforms.uGlowAmt.value = 0.65 + 0.2 * smoothstep(p);
  }

  return { mesh, update };
}
