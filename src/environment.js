import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  SLOPE,
  hillY,
  surfaceY,
  terrainBump,
  terrainNoise,
  mulberry32,
  smoothstep,
} from './world.js';

// The static winter environment: bumpy snow slope, instanced pine forest,
// distant peaks, and the ambient life around them (snowfall, gulls, a
// chairlift, wind-blown spindrift, snow sparkle). Every animated piece is
// a pure function of elapsed time; nothing depends on scroll history.

/** Pixels per world unit at depth 1, for shader point sizing. */
function pointScale(camera) {
  return (
    (window.innerHeight * Math.min(window.devicePixelRatio, 2)) /
    (2 * Math.tan((camera.fov * Math.PI) / 360))
  );
}

// GLSL twin of world.js's surfaceY, so GPU-driven particles can hug the
// bumpy snow without a CPU pass. Must stay in sync with terrainNoise,
// corridorFalloff, and BUMP_HEIGHT.
const SNOW_Y_GLSL = /* glsl */ `
  float tnoise(vec2 p) {
    return sin(p.x * 0.061 + p.y * 0.043) * 0.55 +
           sin(p.x * 0.017 - p.y * 0.089 + 1.7) * 0.3 +
           sin(p.x * 0.14 + p.y * 0.021 + 4.2) * 0.15;
  }
  float snowY(vec2 p) {
    float t = clamp((abs(p.x) - 22.0) / 38.0, 0.0, 1.0);
    float fall = t * t * (3.0 - 2.0 * t);
    float zl = p.y / ${Math.cos(SLOPE).toFixed(6)};
    return -${Math.tan(SLOPE).toFixed(6)} * p.y +
           tnoise(vec2(p.x, zl)) * 2.0 * fall * ${Math.cos(SLOPE).toFixed(6)};
  }
`;

// --- Hill --------------------------------------------------------------------

export function buildHill() {
  const geo = new THREE.PlaneGeometry(400, 700, 100, 175);
  geo.rotateX(-Math.PI / 2); // lie flat in local XZ
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const white = new THREE.Color(0xffffff);
  const icePale = new THREE.Color(0xdbe9f2);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainBump(x, z));
    // Subtle blue mottling so the snow surface has visible texture even
    // where the corridor keeps the geometry perfectly smooth.
    const k = (terrainNoise(x * 2.3 + 9, z * 2.3 - 4) * 0.5 + 0.5) * 0.35;
    c.copy(white).lerp(icePale, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const hill = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      vertexColors: true,
    }),
  );
  hill.rotation.x = SLOPE; // tilt so smooth-surface height matches hillY(z)
  hill.receiveShadow = true;
  return hill;
}

// --- Pine forest ---------------------------------------------------------------
// One stylized tree = trunk + three foliage cones. Rendered as four
// InstancedMeshes so hundreds of trees cost four draw calls.

const TREE_PARTS = [
  { geo: () => new THREE.CylinderGeometry(0.14, 0.22, 1.2, 5), y: 0.6, color: null },
  { geo: () => new THREE.ConeGeometry(1.5, 2.2, 6), y: 2.1, color: 0xa8c8dc },
  { geo: () => new THREE.ConeGeometry(1.15, 1.9, 6), y: 3.3, color: 0xb7d3e4 },
  { geo: () => new THREE.ConeGeometry(0.8, 1.7, 6), y: 4.45, color: 0xe6f1f7 },
];
const TRUNK_COLOR = 0x6b7f8e;

export function buildTrees() {
  const rng = mulberry32(20260711);
  const placements = [];
  for (const side of [-1, 1]) {
    // Broad forest on the flanks.
    for (let i = 0; i < 90; i++) {
      const x = side * (28 + rng() * 105);
      const z = -320 + rng() * 335;
      placements.push({
        x,
        z,
        y: surfaceY(x, z) - 0.3, // sink slightly so trunks never hover
        s: 0.8 + rng() * 1.0,
        rot: rng() * Math.PI * 2,
        tint: (rng() - 0.5) * 0.12,
      });
    }
    // Sparse strip hugging the run so the mid-ground has depth cues.
    for (let i = 0; i < 25; i++) {
      const x = side * (30 + rng() * 28);
      const z = -190 + rng() * 195;
      placements.push({
        x,
        z,
        y: surfaceY(x, z) - 0.3,
        s: 0.9 + rng() * 1.1,
        rot: rng() * Math.PI * 2,
        tint: (rng() - 0.5) * 0.12,
      });
    }
  }

  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  for (const part of TREE_PARTS) {
    const mat = new THREE.MeshStandardMaterial({
      color: part.color ?? TRUNK_COLOR,
      flatShading: true,
    });
    if (part.color !== null) mat.color.set(0xffffff); // tint via instanceColor
    const mesh = new THREE.InstancedMesh(part.geo(), mat, placements.length);
    mesh.castShadow = true;

    placements.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(
        new THREE.Vector3(p.x, p.y + part.y * p.s, p.z),
        q,
        new THREE.Vector3(p.s, p.s, p.s),
      );
      mesh.setMatrixAt(i, m);
      if (part.color !== null) {
        col.set(part.color).offsetHSL(0, 0, p.tint);
        mesh.setColorAt(i, col);
      }
    });
    group.add(mesh);
  }
  return group;
}

// --- Boulders -----------------------------------------------------------------
// A few half-buried rocks along the run edges break up the open snow.

export function buildRocks() {
  const rng = mulberry32(9090);
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc9d8e2,
    flatShading: true,
  });
  const count = 30;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (26 + rng() * 64);
    const z = -300 + rng() * 310;
    const s = 0.4 + rng() * 1.4;
    e.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(x, surfaceY(x, z) + s * 0.25, z),
      q,
      new THREE.Vector3(s * (0.8 + rng() * 0.8), s * 0.7, s * (0.8 + rng() * 0.8)),
    );
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

// --- Distant peaks ----------------------------------------------------------------
// Unlit, fog-exempt silhouettes past the top of the run. Two depth layers,
// slightly different values, read as a mountain range in the haze.

export function buildMountains() {
  const rng = mulberry32(77);
  const group = new THREE.Group();
  const layers = [
    { z: -520, color: 0xcfe0ec, count: 7, hMin: 90, hMax: 190, spread: 340 },
    { z: -440, color: 0xbdd4e5, count: 5, hMin: 60, hMax: 120, spread: 300 },
  ];
  for (const layer of layers) {
    const mat = new THREE.MeshBasicMaterial({ color: layer.color, fog: false });
    for (let i = 0; i < layer.count; i++) {
      const h = layer.hMin + rng() * (layer.hMax - layer.hMin);
      const r = h * (0.9 + rng() * 0.5);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
      peak.position.set(
        (i / (layer.count - 1) - 0.5) * 2 * layer.spread + (rng() - 0.5) * 60,
        64 + h / 2,
        layer.z + (rng() - 0.5) * 40,
      );
      peak.rotation.y = rng() * Math.PI;
      group.add(peak);
    }
  }
  return group;
}

// --- Snowfall -----------------------------------------------------------------------

const FLAKES = 1200;
const FALL_HEIGHT = 50;

export function makeRoundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createSnowfall() {
  const rng = mulberry32(404);
  const flakes = [];
  for (let i = 0; i < FLAKES; i++) {
    flakes.push({
      x: -70 + rng() * 140,
      z: -140 + rng() * 150, // -140 .. +10, stays in front of the camera
      y0: rng() * FALL_HEIGHT,
      speed: 2 + rng() * 3,
      amp: 0.5 + rng() * 1.5,
      phase: rng() * Math.PI * 2,
    });
  }

  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(FLAKES * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));

  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.35,
      map: makeRoundTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );

  function update(time) {
    for (let i = 0; i < FLAKES; i++) {
      const f = flakes[i];
      const fall = (f.y0 - f.speed * time) % FALL_HEIGHT;
      const y = fall < 0 ? fall + FALL_HEIGHT : fall;
      arr[i * 3] = f.x + Math.sin(time * 0.8 + f.phase) * f.amp;
      arr[i * 3 + 1] = hillY(f.z) - 4 + y;
      arr[i * 3 + 2] = f.z;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { points, update };
}

// Birds cross the sky over this much x before wrapping; the ends sit well
// outside the frustum so the wrap is never on screen.
const BIRD_SPAN = 280;

/**
 * A few gulls gliding across the sky: two-triangle silhouettes on long
 * straight flight lines, with flapping that eases in and out of glides.
 * Like the snowfall, they are a pure function of elapsed time; nothing
 * depends on scroll history.
 */
export function createBirds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1d3547, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0.35, 0, 0, -0.25, 0, 0, 0.05, 0, 1], 3),
  );

  // One loose trio, high above the ridgeline; starting positions sit in
  // the view so the sky has life immediately.
  // [x0, y, z, speed, scale, flapRate, phase]
  const BIRDS = [
    [-28, 88, -160, 6.5, 3.2, 7.0, 0],
    [-48, 93, -170, 6.5, 2.8, 7.6, 1.9],
    [-63, 84, -152, 6.5, 2.9, 7.3, 3.6],
  ];
  const birds = BIRDS.map(([x0, y, z, speed, scale, flapRate, phase]) => {
    const b = new THREE.Group();
    const right = new THREE.Mesh(wingGeo, mat);
    const left = new THREE.Mesh(wingGeo, mat);
    left.scale.z = -1;
    b.add(right, left);
    b.scale.setScalar(scale);
    b.rotation.y = speed > 0 ? 0 : Math.PI;
    group.add(b);
    return { b, right, left, x0, y, z, speed, flapRate, phase };
  });

  function update(time) {
    for (const k of birds) {
      const x =
        ((((k.x0 + BIRD_SPAN / 2 + k.speed * time) % BIRD_SPAN) + BIRD_SPAN) %
          BIRD_SPAN) -
        BIRD_SPAN / 2;
      k.b.position.set(x, k.y + Math.sin(time * 0.4 + k.phase) * 1.5, k.z);
      // Flap amplitude swells and fades so each bird alternates between
      // beating and gliding, out of phase with its neighbours.
      const effort = 0.25 + 0.75 * Math.max(0, Math.sin(time * 0.5 + k.phase * 2));
      const a = Math.sin(time * k.flapRate + k.phase) * 0.65 * effort;
      k.right.rotation.x = a;
      k.left.rotation.x = -a;
    }
  }

  return { group, update };
}

// --- Chairlift ------------------------------------------------------------------
// A lift line up the far left flank: pylons, two 1px cables, and chairs
// that glide up one side and down the other. It lives in the mid-to-far
// ground (never nearer than LIFT_BOT_Z) so it reads as quiet background
// motion fading into the fog, not foreground clutter.

const LIFT_X = -52;
const LIFT_TOP_Z = -320; // past full fog, so the wrap point is never seen
const LIFT_BOT_Z = -12; // off-frustum at the camera's edge
const LIFT_H = 8.5; // cable height above the smooth slope
const CABLE_GAP = 1.3; // half-distance between up and down cables
const CHAIRS_PER_CABLE = 8;
const LIFT_SPEED = 3.2; // world units per second along the cable

export function createChairlift() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8ba1b2, flatShading: true });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x5c7185, flatShading: true });
  const m = new THREE.Matrix4();

  // Pylons: tapered poles from the terrain up to the cable, with a crossbar.
  const pylonZ = [];
  for (let i = 0; i < 7; i++) {
    pylonZ.push(LIFT_TOP_Z + 6 + ((LIFT_BOT_Z - LIFT_TOP_Z - 12) * i) / 6);
  }
  const poleGeo = new THREE.CylinderGeometry(0.26, 0.36, 1, 6);
  poleGeo.translate(0, 0.5, 0); // base at origin so scale.y sets the height
  const poles = new THREE.InstancedMesh(poleGeo, steel, pylonZ.length);
  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CABLE_GAP * 2 + 0.9, 0.16, 0.16),
    steel,
    pylonZ.length,
  );
  poles.castShadow = true;
  bars.castShadow = true;
  pylonZ.forEach((z, i) => {
    const base = surfaceY(LIFT_X, z) - 0.4;
    const top = hillY(z) + LIFT_H;
    m.makeScale(1, top - base, 1);
    m.setPosition(LIFT_X, base, z);
    poles.setMatrixAt(i, m);
    m.identity();
    m.setPosition(LIFT_X, top, z);
    bars.setMatrixAt(i, m);
  });
  group.add(poles, bars);

  // Cables: straight 1px lines (the slope is linear, so two points each).
  const cableMat = new THREE.LineBasicMaterial({ color: 0x7d93a6 });
  for (const side of [-1, 1]) {
    const x = LIFT_X + side * CABLE_GAP;
    const pts = [
      new THREE.Vector3(x, hillY(LIFT_TOP_Z) + LIFT_H, LIFT_TOP_Z),
      new THREE.Vector3(x, hillY(LIFT_BOT_Z) + LIFT_H, LIFT_BOT_Z),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
  }

  // Chairs: hanger + seat + back merged into one geometry, instanced.
  const hanger = new THREE.BoxGeometry(0.07, 1.45, 0.07);
  hanger.translate(0, -0.72, -0.22);
  const seat = new THREE.BoxGeometry(1.0, 0.09, 0.5);
  seat.translate(0, -1.44, 0.05);
  const back = new THREE.BoxGeometry(1.0, 0.52, 0.08);
  back.translate(0, -1.16, -0.25);
  const total = CHAIRS_PER_CABLE * 2;
  const chairs = new THREE.InstancedMesh(mergeGeometries([hanger, seat, back]), chairMat, total);
  chairs.castShadow = true;
  chairs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(chairs);

  const L = LIFT_BOT_Z - LIFT_TOP_Z;
  const spacing = L / CHAIRS_PER_CABLE;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  function update(time) {
    for (let i = 0; i < total; i++) {
      const up = i < CHAIRS_PER_CABLE; // riding toward the summit (-z)
      const k = up ? i : i - CHAIRS_PER_CABLE;
      const d = (k * spacing + LIFT_SPEED * time) % L;
      const z = up ? LIFT_BOT_Z - d : LIFT_TOP_Z + d;
      pos.set(LIFT_X + (up ? -CABLE_GAP : CABLE_GAP), hillY(z) + LIFT_H, z);
      // Chairs face their direction of travel, with a slow pendulum sway.
      e.set(0.05 * Math.sin(time * 0.7 + i * 1.7), up ? Math.PI : 0, 0);
      q.setFromEuler(e);
      m.compose(pos, q, one);
      chairs.setMatrixAt(i, m);
    }
    chairs.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}

// --- Spindrift ---------------------------------------------------------------------
// Occasional gusts of wind-blown snow streaming low across the run. Each
// gust is a loose trail of particles that sweeps from the right flank
// toward the left on its own repeat period, entirely computed in the
// vertex shader from elapsed time, so the CPU cost is one uniform write.

const GUSTS = 6;
const GUST_PARTICLES = 34;

export function createSpindrift() {
  const rng = mulberry32(2718);
  const count = GUSTS * GUST_PARTICLES;
  const positions = new Float32Array(count * 3); // xz start; y is lift height
  const vels = new Float32Array(count * 2);
  const timings = new Float32Array(count * 3); // period, offset, travel time
  const miscs = new Float32Array(count * 2); // brightness, sway phase

  let i = 0;
  for (let g = 0; g < GUSTS; g++) {
    const x0 = 50 + rng() * 18;
    const z0 = -35 - rng() * 120;
    const drift = 0.15 + rng() * 0.3; // downhill slant of the wind
    const inv = 1 / Math.hypot(1, drift);
    const dx = -inv;
    const dz = drift * inv;
    const speed = 9 + rng() * 5;
    const dur = 115 / speed; // seconds to cross the run
    const period = dur * (1.7 + rng() * 1.2); // quiet gap between gusts
    const offset = rng() * period;
    for (let k = 0; k < GUST_PARTICLES; k++, i++) {
      const lag = rng(); // 0 at the head of the gust, 1 at the tail
      const along = -lag * 9;
      const lat = (rng() - 0.5) * 2.6;
      positions[i * 3] = x0 + dx * along - dz * lat;
      positions[i * 3 + 1] = 0.12 + rng() * 0.5 + lag * 0.25;
      positions[i * 3 + 2] = z0 + dz * along + dx * lat;
      const sj = speed * (0.9 + rng() * 0.2); // shear stretches the tail
      vels[i * 2] = dx * sj;
      vels[i * 2 + 1] = dz * sj;
      timings[i * 3] = period;
      timings[i * 3 + 1] = offset + rng() * 0.4;
      timings[i * 3 + 2] = dur;
      miscs[i * 2] = 0.24 + (1 - lag) * 0.22;
      miscs[i * 2 + 1] = rng() * Math.PI * 2;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vels, 2));
  geo.setAttribute('aTiming', new THREE.BufferAttribute(timings, 3));
  geo.setAttribute('aMisc', new THREE.BufferAttribute(miscs, 2));

  const uniforms = { uTime: { value: 0 }, uScale: { value: 1 } };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec2 aVel;
        attribute vec3 aTiming;
        attribute vec2 aMisc;
        uniform float uTime, uScale;
        varying float vAlpha;
        ${SNOW_Y_GLSL}
        void main() {
          float tc = mod(uTime + aTiming.y, aTiming.x);
          float prog = tc / aTiming.z;
          vec2 p = position.xz + aVel * tc;
          // Swell in, stream, and die out; past prog 1 the gust rests.
          float env = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.55, 1.0, prog));
          float y = snowY(p) + position.y +
                    0.1 * sin(uTime * 2.8 + aMisc.y) * (0.5 + position.y);
          vec4 mv = modelViewMatrix * vec4(p.x, y, p.y, 1.0);
          vAlpha = env * aMisc.x * (1.0 - smoothstep(150.0, 240.0, -mv.z));
          gl_PointSize = 0.9 * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5)) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.97, 0.99, 1.0, a);
        }
      `,
    }),
  );
  points.frustumCulled = false;

  function update(camera, time) {
    uniforms.uTime.value = time;
    uniforms.uScale.value = pointScale(camera);
  }

  return { points, update };
}

// --- Snow sparkle --------------------------------------------------------------------
// Sparse glints scattered on the snow near the camera, each flashing
// briefly on its own cycle like sun catching ice crystals. Fixed seeded
// positions; the twinkle is pure shader work.

const SPARKLES = 130;

export function createSparkles() {
  const rng = mulberry32(1313);
  const positions = new Float32Array(SPARKLES * 3);
  const phases = new Float32Array(SPARKLES);
  const rates = new Float32Array(SPARKLES);
  for (let i = 0; i < SPARKLES; i++) {
    const x = (rng() * 2 - 1) * 58;
    const z = 8 - rng() * rng() * 140; // denser near the camera
    positions[i * 3] = x;
    positions[i * 3 + 1] = surfaceY(x, z) + 0.03;
    positions[i * 3 + 2] = z;
    phases[i] = rng() * Math.PI * 2;
    rates[i] = 0.5 + rng() * 0.9;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aRate', new THREE.BufferAttribute(rates, 1));

  const uniforms = { uTime: { value: 0 }, uScale: { value: 1 } };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aPhase, aRate;
        uniform float uTime, uScale;
        varying float vAlpha;
        void main() {
          // High power keeps each glint dark most of its cycle with one
          // brief bright flash.
          float glint = pow(max(sin(uTime * aRate + aPhase), 0.0), 14.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vAlpha = glint * (1.0 - smoothstep(90.0, 160.0, -mv.z));
          gl_PointSize = (0.05 + 0.06 * glint) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 d = abs(gl_PointCoord - 0.5);
          float a = clamp(1.0 - (d.x + d.y) * 2.4, 0.0, 1.0) * vAlpha * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a);
        }
      `,
    }),
  );
  points.frustumCulled = false;

  function update(camera, time) {
    uniforms.uTime.value = time;
    uniforms.uScale.value = pointScale(camera);
  }

  return { points, update };
}

// --- Easter eggs -----------------------------------------------------------------
// Hidden things for patient visitors. Both are pure functions of elapsed
// time or plain click reactions, so the scroll invariant is untouched and
// the scene looks identical until someone finds them.

/** One stylized pine as plain meshes (the forest itself is instanced). */
function buildLonePine(scale, tint) {
  const pine = new THREE.Group();
  for (const part of TREE_PARTS) {
    const mat = new THREE.MeshStandardMaterial({
      color: part.color ?? TRUNK_COLOR,
      flatShading: true,
    });
    if (part.color !== null && tint) mat.color.offsetHSL(0, 0, tint);
    const mesh = new THREE.Mesh(part.geo(), mat);
    mesh.position.y = part.y * scale;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    pine.add(mesh);
  }
  return pine;
}

// A lone pine just clear of the forest edge, so the peek has an open
// sightline (inside the strip the other trees hide it).
const YETI_X = 26;
const YETI_Z = -48;
const YETI_PERIOD = 137; // seconds between peeks
const YETI_DELAY = 49; // first peek this long after load

/**
 * A yeti who very occasionally leans out from behind a pine on the right
 * flank, looks around, and ducks back. Blink and you miss him.
 */
export function createYeti() {
  const group = new THREE.Group();

  const pine = buildLonePine(1.35, 0.04);
  pine.position.set(YETI_X, surfaceY(YETI_X, YETI_Z) - 0.3, YETI_Z);
  group.add(pine);

  // Icy blue-gray fur: pure white would vanish against the snow behind
  // him, and the palette allows it (it matches the pine foliage tones).
  const fur = new THREE.MeshStandardMaterial({ color: 0xb9d0e0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d3547, flatShading: true });
  const yeti = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.62, 1.5, 7), fur);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 0), fur);
  head.position.y = 1.78;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 6), dark);
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 1.82, 0.38);
  const paw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.2), fur);
  paw.position.set(0.56, 1.06, 0.12);
  paw.rotation.z = -0.5;
  yeti.add(body, head, face, paw);
  yeti.castShadow = true;
  const baseY = surfaceY(YETI_X, YETI_Z) - 0.15;
  yeti.position.set(YETI_X, baseY, YETI_Z - 0.7); // tucked behind the trunk
  yeti.visible = false;
  group.add(yeti);

  function update(time) {
    const tc = (time + YETI_PERIOD - YETI_DELAY) % YETI_PERIOD;
    if (tc > 5.4) {
      yeti.visible = false;
      return;
    }
    yeti.visible = true;
    // Step out from behind the canopy (the lowest foliage cone is about
    // two units wide, so a timid lean would never clear it), glance
    // around, and duck back.
    const out = smoothstep(tc / 0.9) * (1 - smoothstep((tc - 4.3) / 0.9));
    yeti.position.x = YETI_X - 2.5 * out;
    yeti.rotation.z = 0.14 * out;
    yeti.rotation.y = 0.3 * Math.sin(time * 1.4) * out;
  }

  return { group, update };
}

const ODD_X = -36;
const ODD_Z = -80;
const ODD_SCALE = 1.6;

/**
 * The odd tree: one pine in the left forest wears a slowly turning star.
 * Clicking it shakes the snow off in a powder whump; main.js does the
 * raycast and the spray, this module owns the tree and the star's little
 * celebration spin.
 */
export function createOddTree() {
  const group = new THREE.Group();
  const baseY = surfaceY(ODD_X, ODD_Z) - 0.3;

  const pine = buildLonePine(ODD_SCALE, 0.06);
  pine.position.set(ODD_X, baseY, ODD_Z);
  group.add(pine);

  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
  );
  star.scale.y = 1.5;
  const starY = baseY + (4.45 + 1.1) * ODD_SCALE;
  star.position.set(ODD_X, starY, ODD_Z);
  group.add(star);

  let spinStart = -1e9;

  function update(time) {
    // A slow idle turn is the tell for observant visitors; a click adds a
    // fast celebratory spin and a size pulse on top.
    const u = (time - spinStart) / 1.6;
    const burst = u > 0 && u < 1 ? smoothstep(u) : u >= 1 ? 1 : 0;
    const pulse = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
    star.rotation.y = time * 0.6 + burst * Math.PI * 6;
    star.scale.setScalar(1 + 0.45 * pulse);
    star.scale.y = 1.5 * (1 + 0.45 * pulse);
  }

  function trigger(time) {
    spinStart = time;
  }

  // Canopy heights for the snow the click shakes loose.
  const dumpPoints = [
    new THREE.Vector3(ODD_X, baseY + 2.1 * ODD_SCALE, ODD_Z),
    new THREE.Vector3(ODD_X, baseY + 3.3 * ODD_SCALE, ODD_Z),
    new THREE.Vector3(ODD_X, baseY + 4.45 * ODD_SCALE, ODD_Z),
  ];

  return { group, update, trigger, dumpPoints };
}
