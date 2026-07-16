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
const PENNANT = 0x231910; // pennants read as dark silhouettes, like the city

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

function buildRidge(z, crestY, color, seed, ampScale = 1) {
  const rng = mulberry32(seed);
  const X0 = -320;
  const X1 = 320;
  const STEPS = 64;
  const base = -40; // skirt drops well below the horizon, hidden by nearer land
  const verts = [];
  const idx = [];

  const a1 = (6 + rng() * 4) * ampScale;
  const a2 = (2.5 + rng() * 2) * ampScale;
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
  // Double-sided: the strip's front face points away from the camera, so a
  // single-sided material would cull it.
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

export function buildHills() {
  const group = new THREE.Group();
  group.add(buildRidge(-78, 4, RIDGE_NEAR, 21));
  group.add(buildRidge(-116, 8, RIDGE_FAR, 47));
  return group;
}

// --- Far mountains (aerial depth behind the city) ---------------------------
// Two tall, jagged ranges set well behind Camelot. The scene fog lightens them
// toward the amber horizon on its own, so they read as receding layers with no
// gradient painted on the land. This is the depth the flat plain was missing.
export function buildMountains() {
  const group = new THREE.Group();
  group.add(buildRidge(-245, 38, 0x3a2712, 63, 1.9));
  group.add(buildRidge(-330, 52, 0x46311a, 71, 2.5));
  return group;
}

// --- Foreground grass (near-camera framing, sways in the wind) ---------------
// A band of tapered blades close to the lens, so the scene has a near layer in
// front of the road, not just a bare plain. They read as a dark silhouette and
// bend in the wind on the GPU: the vertex shader offsets each blade by a sine
// of elapsed time (bend concentrated toward the tip via aBend), each blade on
// its own phase. Near the camera, so the fog never touches it. Pure function of
// elapsed time, like the snow on the mountain.
export function buildGrass() {
  const rng = mulberry32(4242);
  const TUFTS = 440;
  const SEG = 4;
  const pos = [];
  const bend = [];
  const phase = [];
  const idx = [];
  let v = 0;

  // Grass grows in clumps: scatter tuft centers across a low band right up
  // against the lens, then pack several blades into each so they read as a
  // dense grassy fringe rather than isolated spikes.
  for (let ti = 0; ti < TUFTS; ti++) {
    const cx = -68 + rng() * 136;
    const cz = 13 + rng() * 10; // very near field, in front of everything
    const nb = 4 + ((rng() * 4) | 0); // 4-7 blades per tuft

    for (let bi = 0; bi < nb; bi++) {
      const bx = cx + (rng() - 0.5) * 0.95;
      const bz = cz + (rng() - 0.5) * 0.95;
      const by = groundY(bx, bz) - 0.05;
      const h = 0.24 + rng() * 0.5;
      const w = 0.05 + rng() * 0.07;
      const ph = rng() * Math.PI * 2;
      const lean = (rng() - 0.5) * 0.32;

      for (let r = 0; r <= SEG; r++) {
        const t = r / SEG;
        const y = t * h;
        const hw = (w * (1 - t)) / 2; // taper to a point at the tip
        const xc = bx + lean * y;
        pos.push(xc - hw, by + y, bz, xc + hw, by + y, bz);
        const b = Math.pow(t, 1.6); // sway grows toward the tip
        bend.push(b, b);
        phase.push(ph, ph);
        if (r < SEG) {
          const a = v + r * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      v += (SEG + 1) * 2;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBend', new THREE.Float32BufferAttribute(bend, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  geo.setIndex(idx);

  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aBend;
      attribute float aPhase;
      uniform float uTime;
      void main() {
        vec3 p = position;
        float sway = sin(uTime * 1.5 + aPhase) * 0.5 + sin(uTime * 3.3 + aPhase * 1.7) * 0.16;
        p.x += sway * aBend * 0.18;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      // Close to the ground colour behind it (GRASS 0x53431f), a touch darker,
      // so the fringe reads as texture rather than a stark band of spikes.
      void main() { gl_FragColor = vec4(0.255, 0.205, 0.093, 1.0); }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, update: (t) => (uniforms.uTime.value = t) };
}

// --- A lone gnarled tree (foreground character + framing) --------------------
// One bare, branching silhouette standing off to the side, built by recursive
// forking so no two branches match. A dark flat silhouette like the rest of the
// land; placed near the camera so it frames the plain and adds a strong near
// element the empty foreground lacked.
export function buildDeadTree() {
  const rng = mulberry32(9091);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  function seg(x, y, z, dir, len, r1, r2) {
    const g = new THREE.CylinderGeometry(r2, r1, len, 6);
    g.translate(0, len / 2, 0);
    q.setFromUnitVectors(up, tmp.copy(dir).normalize());
    g.applyQuaternion(q);
    g.translate(x, y, z);
    parts.push(g);
  }

  // Each branch is drawn as a few short segments that curve gradually, so limbs
  // bend and knuckle like real wood instead of being dead straight; radius
  // tapers continuously and every fork spawns 2-3 thinner limbs.
  function grow(x, y, z, dir, len, r, depth) {
    const SUB = 3;
    const sub = len / SUB;
    const bend = (rng() - 0.5) * 0.6; // total sweep of this limb
    let d = dir.clone().normalize();
    let cx = x;
    let cy = y;
    let cz = z;
    let rr = r;
    for (let s = 0; s < SUB; s++) {
      const a = bend / SUB;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      d = new THREE.Vector3(d.x * c - d.y * sn, d.x * sn + d.y * c, d.z + (rng() - 0.5) * 0.09).normalize();
      const nr = rr * 0.86;
      seg(cx, cy, cz, d, sub, rr, nr);
      cx += d.x * sub;
      cy += d.y * sub;
      cz += d.z * sub;
      rr = nr;
    }
    if (depth <= 0) return;
    // Fork into 2-3 limbs; twigs near the ends split a touch more for a fuller
    // crown of fine branches.
    const n = 2 + (rng() < (depth <= 2 ? 0.7 : 0.4) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ang = (rng() - 0.5) * 1.55;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const nd = new THREE.Vector3(
        d.x * c - d.y * sn,
        d.x * sn + d.y * c,
        d.z + (rng() - 0.5) * 0.45,
      ).normalize();
      grow(cx, cy, cz, nd, len * (0.58 + rng() * 0.22), rr * 0.71, depth - 1);
    }
  }

  grow(0, 0, 0, new THREE.Vector3(0.05, 1, 0), 3.5, 0.48, 6);

  const tree = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color: 0x130e07 }));
  const group = new THREE.Group();
  group.add(tree);
  // Left foreground: it fills the near left when no card is up, and a card
  // (opaque, on top) politely covers it when one is.
  group.position.set(-11, groundY(-11, 2), 2);
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
  const spireTops = []; // exact top of every spire, for the pennants to crown

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
    spireTops.push({ x, y: PLINTH + h + capH, z });
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

  // Royal standards fluttering over the towers: the one always-moving element
  // on this side of the frame. They ride as a child of the city group, so they
  // inherit its placement and rotation; only the cloth animates, on a time
  // loop (wind), independent of the scroll.
  const pennants = createPennants(spireTops);
  group.add(pennants.group);

  // Lifted clear of the foreground ridges so the skyline is not clipped by the
  // hills (its raised plinth base hides behind the near hill crest).
  group.position.set(CAMELOT.x, groundY(CAMELOT.x, CAMELOT.z) - PLINTH + 9, CAMELOT.z);
  group.rotation.y = -0.32; // angle a front corner toward the camera
  return { group, update: pennants.update };
}

// A small triangular pennant on a short pole crowning each spire, flying the
// king's gold. Fog-exempt so the gold stays vivid against the distant city.
// The cloth waves as a pure function of elapsed time (wind), each with its own
// phase so the row does not flap in lockstep.
function createPennants(anchors) {
  const group = new THREE.Group();
  const flags = [];
  const flagMat = new THREE.MeshBasicMaterial({
    color: PENNANT,
    side: THREE.DoubleSide,
    fog: false,
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: CITY_STONES[0], flatShading: true });

  const POLE_H = 4.5;
  const LEN = 3.4;
  const HEIGHT = 1.9;

  anchors.forEach((a, i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, POLE_H, 5), poleMat);
    pole.position.set(a.x, a.y + POLE_H / 2, a.z);
    group.add(pole);

    // Pennant plane in XY (faces the camera), left edge pinned at the pole and
    // tapering to a point at the fly end.
    const geo = new THREE.PlaneGeometry(LEN, HEIGHT, 8, 1);
    geo.translate(LEN / 2, 0, 0);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const t = p.getX(j) / LEN; // 0 at the pole, 1 at the fly
      p.setY(j, p.getY(j) * (1 - t));
    }
    const flag = new THREE.Mesh(geo, flagMat);
    flag.position.set(a.x + 0.13, a.y + POLE_H - 0.55, a.z);
    group.add(flag);

    flags.push({ flag, base: geo.attributes.position.array.slice(), ph: i * 1.7 });
  });

  // Bell-toll bloom: a soft warm glow that peals out from the tallest tower and
  // expands as it fades, so a click on the city rings out with light.
  let center = anchors[0] ?? { x: 0, y: 40, z: 0 };
  for (const a of anchors) if (a.y > center.y) center = a;
  const bloomMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffdb95) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main() { float r = length(vUv - 0.5); float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(uColor, a * uOpacity); }
    `,
  });
  const bloom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bloomMat);
  bloom.position.set(center.x, center.y + POLE_H, center.z);
  bloom.renderOrder = 2;
  group.add(bloom);

  // `excite` (0..1) is the bell-toll: it whips the cloth harder and drives the
  // bloom. It decays back to the resting wind in main.js.
  function update(time, excite = 0) {
    const amp = 0.18 * (1 + excite * 2.6);
    const speed = 4.0 * (1 + excite * 0.9);
    for (const f of flags) {
      const p = f.flag.geometry.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const bx = f.base[j * 3]; // distance out from the pole
        p.setZ(j, Math.sin(bx * 2.0 - time * speed + f.ph) * amp * bx);
      }
      p.needsUpdate = true;
    }
    bloomMat.uniforms.uOpacity.value = excite * 0.7;
    bloom.scale.setScalar(8 + (1 - excite) * 26); // small and bright at the toll, expands as it fades
  }

  return { group, update };
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
