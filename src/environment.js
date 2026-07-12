import * as THREE from 'three';
import {
  SLOPE,
  hillY,
  surfaceY,
  terrainBump,
  terrainNoise,
  mulberry32,
} from './world.js';

// The static winter environment: bumpy snow slope, instanced pine forest,
// distant peaks, and an animated snowfall particle field.

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
