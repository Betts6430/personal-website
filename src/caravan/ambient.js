import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './world.js';

// The always-moving "life" layer of the caravan: things that drift on elapsed
// time regardless of the scroll (wind, air, wings), the caravan's answer to the
// mountain's snow, gulls, chairlift, and spindrift. Everything here is a pure
// function of elapsed time, so holding the scroll never freezes it and the
// pure-function-of-p invariant on the world geometry is untouched.
//
// The heavy fields (motes, smoke) are GPU points: the vertex shader computes
// each particle's animated position from elapsed time, so there is no per-frame
// CPU work beyond ticking one uniform.

// --- Drifting dust motes ----------------------------------------------------
// Warm specks catching the low sun, floating and rising through the air across
// the whole plain. This is the scene's answer to the mountain's snowfall and
// sparkle glints: a constant, weightless shimmer that fills the empty air.
export function createMotes() {
  const rng = mulberry32(70707);
  const N = 360;
  const BAND = 38; // vertical wrap height
  const pos = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  const speed = new Float32Array(N);
  const size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -95 + rng() * 190;
    pos[i * 3 + 1] = rng() * BAND;
    pos[i * 3 + 2] = -76 + rng() * 88;
    phase[i] = rng();
    speed[i] = 0.5 + rng() * 1.2;
    size[i] = 0.4 + rng() * 0.85;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe1b2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aPhase; attribute float aSpeed; attribute float aSize;
      uniform float uTime; varying float vA;
      void main() {
        float rise = mod(position.y + uTime * aSpeed + aPhase * ${BAND.toFixed(1)}, ${BAND.toFixed(1)});
        vec3 p = vec3(
          position.x + sin(uTime * 0.35 + aPhase * 6.2831) * 1.9,
          1.5 + rise,
          position.z + cos(uTime * 0.30 + aPhase * 6.2831) * 1.9
        );
        // fade in/out at the band edges so the vertical wrap is invisible
        vA = smoothstep(0.0, 4.0, rise) * (1.0 - smoothstep(${(BAND - 6).toFixed(1)}, ${BAND.toFixed(1)}, rise));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * 300.0 / -mv.z, 11.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r) * 0.5 * vA;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, update: (t) => (uniforms.uTime.value = t) };
}

// --- Smoke plumes -----------------------------------------------------------
// Streams of soft puffs rising from a set of world sources (a roadside campfire
// and Camelot's chimneys), curling and leaning with the wind, fading as they
// climb. Warm grey-brown, backlit by the low sun. Each puff loops on its own
// phase (a pure function of elapsed time).
export function createSmoke(sources) {
  const rng = mulberry32(313);
  let total = 0;
  for (const s of sources) total += s.count;

  const pos = new Float32Array(total * 3);
  const phase = new Float32Array(total);
  const rate = new Float32Array(total);
  const height = new Float32Array(total);
  const size = new Float32Array(total);
  const wind = new Float32Array(total);
  const spread = new Float32Array(total);
  let k = 0;
  for (const s of sources) {
    const jit = s.baseJit ?? 0.4;
    for (let i = 0; i < s.count; i++) {
      pos[k * 3] = s.x + (rng() - 0.5) * jit;
      pos[k * 3 + 1] = s.y;
      pos[k * 3 + 2] = s.z + (rng() - 0.5) * jit;
      phase[k] = rng();
      rate[k] = s.rate * (0.8 + rng() * 0.4);
      height[k] = s.height * (0.8 + rng() * 0.4);
      size[k] = s.size * (0.7 + rng() * 0.6);
      wind[k] = s.wind;
      spread[k] = s.spread;
      k++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
  geo.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
  geo.setAttribute('aSpread', new THREE.BufferAttribute(spread, 1));

  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x8a7358) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aPhase; attribute float aRate; attribute float aHeight;
      attribute float aSize; attribute float aWind; attribute float aSpread;
      uniform float uTime; varying float vLife;
      void main() {
        float life = fract(uTime * aRate + aPhase);
        vLife = life;
        vec3 p = position;
        p.y += life * aHeight;
        p.x += aWind * life * aHeight + sin(aPhase * 6.2831 + life * 5.0) * aSpread * life;
        p.z += cos(aPhase * 6.2831 + life * 4.0) * aSpread * life * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (0.4 + life * 1.8) * 300.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vLife;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        if (r > 0.5) discard;
        float soft = smoothstep(0.5, 0.0, r);
        float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
        gl_FragColor = vec4(uColor, soft * fade * 0.32);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, update: (t) => (uniforms.uTime.value = t) };
}

// --- Campfire flame ---------------------------------------------------------
// A small bright flame at the roadside camp: two nested cones of warm color,
// fog-exempt so the fire stays vivid, flickering in scale and brightness on
// time. A warm focal point that also motivates the campfire smoke plume.
export function createFire(x, y, z) {
  const group = new THREE.Group();

  // A little stack of logs at the base so the flame sits in a fire, not in mid
  // air. Dark silhouette wood; the flame rises out of it from ground level.
  const logMat = new THREE.MeshStandardMaterial({ color: 0x241a10, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 5), logMat);
    log.castShadow = true;
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.14;
    group.add(log);
  }

  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.35, 7),
    new THREE.MeshBasicMaterial({ color: 0xdd5a1e, transparent: true, opacity: 0.92, fog: false }),
  );
  outer.position.y = 0.7;
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.9, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcf6e, fog: false }),
  );
  inner.position.y = 0.52;
  group.add(outer, inner);
  group.position.set(x, y, z);

  function update(t) {
    const f = 1 + Math.sin(t * 13.0) * 0.12 + Math.sin(t * 21.7) * 0.06;
    outer.scale.set(1 + (f - 1) * 0.4, f, 1 + (f - 1) * 0.4);
    inner.scale.set(1, 0.9 + (f - 1) * 0.6, 1);
    outer.material.opacity = 0.85 + Math.sin(t * 17.0) * 0.1;
  }
  return { group, update };
}

// --- Birds ------------------------------------------------------------------
// Gulls gliding across the amber sky, reusing the mountain scene's design (a
// two-triangle silhouette whose wings span into the screen and beat about the
// fore-aft axis, easing between flapping and gliding). A pure function of
// elapsed time, like the snow. Kept to a handful so the sky stays calm.
const BIRD_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1208, side: THREE.DoubleSide });
const BIRD_WING = new THREE.BufferGeometry();
BIRD_WING.setAttribute(
  'position',
  new THREE.Float32BufferAttribute([0.35, 0, 0, -0.25, 0, 0, 0.05, 0, 1], 3),
);
const BIRD_SPAN = 240; // horizontal wrap, wider than the frame so it is unseen

function makeGull() {
  const b = new THREE.Group();
  const right = new THREE.Mesh(BIRD_WING, BIRD_MAT);
  const left = new THREE.Mesh(BIRD_WING, BIRD_MAT);
  left.scale.z = -1;
  b.add(right, left);
  b.userData = { right, left };
  return b;
}

export function createBirds() {
  const group = new THREE.Group();
  // [x0, y, z, speed, scale, flapRate, phase]
  const defs = [
    [45, 44, -92, -6.0, 3.0, 7.0, 0.0],
    [60, 47, -98, -6.0, 2.6, 7.6, 1.9],
    [33, 41, -86, -6.0, 2.8, 7.3, 3.6],
    [-32, 52, -122, 4.6, 3.4, 6.6, 2.4],
    [-16, 55, -128, 4.6, 3.0, 6.9, 4.1],
  ];
  const birds = defs.map(([x0, y, z, speed, scale, flapRate, phase]) => {
    const b = makeGull();
    b.scale.setScalar(scale);
    b.rotation.y = speed > 0 ? 0 : Math.PI;
    group.add(b);
    return { b, x0, y, z, speed, flapRate, phase };
  });

  function update(time) {
    for (const k of birds) {
      const x =
        ((((k.x0 + BIRD_SPAN / 2 + k.speed * time) % BIRD_SPAN) + BIRD_SPAN) % BIRD_SPAN) -
        BIRD_SPAN / 2;
      k.b.position.set(x, k.y + Math.sin(time * 0.4 + k.phase) * 1.5, k.z);
      // Flap swells and fades so each bird alternates beating and gliding, out
      // of phase with its neighbours.
      const effort = 0.25 + 0.75 * Math.max(0, Math.sin(time * 0.5 + k.phase * 2));
      const a = Math.sin(time * k.flapRate + k.phase) * 0.65 * effort;
      k.b.userData.right.rotation.x = a;
      k.b.userData.left.rotation.x = -a;
    }
  }

  return { group, update };
}

// --- Roost (perched birds that scatter off the towers) ----------------------
// A whole flock sits hidden on Camelot's crown; when the bell tolls (a click on
// the city) they erupt off the towers and beat away over ~3 seconds. A pure
// function of time since the toll, so it replays cleanly and never touches the
// scroll invariant, like the mountain's tree snow-burst.
export function createRoost() {
  const rng = mulberry32(8899);
  const group = new THREE.Group();
  const birds = [];
  for (let i = 0; i < 22; i++) {
    const perch = new THREE.Vector3(46 + rng() * 32, 42 + rng() * 12, -184 + (rng() - 0.5) * 6);
    const b = makeGull();
    b.scale.setScalar(2.0 + rng() * 1.6);
    group.add(b);
    const outward = perch.x > 60 ? 1 : -1;
    birds.push({
      b,
      perch,
      vx: outward * (10 + rng() * 14),
      vy: 15 + rng() * 15,
      vz: (rng() - 0.5) * 10,
      phase: rng() * 6.2831,
    });
  }

  let t0 = -999;
  const DUR = 3.4;

  function scatter(t) {
    t0 = t;
  }

  function update(t) {
    const dt = t - t0;
    const flying = dt >= 0 && dt < DUR;
    for (const o of birds) {
      // Hidden while roosting (no static flock on the towers); they only appear
      // bursting off and beating away when the bell tolls.
      o.b.visible = flying;
      if (flying) {
        o.b.position.set(o.perch.x + o.vx * dt, o.perch.y + o.vy * dt, o.perch.z + o.vz * dt);
        const a = Math.sin(t * 18 + o.phase) * 0.75;
        o.b.userData.right.rotation.x = a;
        o.b.userData.left.rotation.x = -a;
      }
    }
  }

  return { group, update, scatter };
}

// --- Clouds -----------------------------------------------------------------
// Three long, thin flat cloud streaks drifting slowly across the high sky. Each
// is a stack of wide, shallow low-poly lobes (crisp edges, not a soft blur), a
// warm tint just off the sky. Spaced a third of the wrap apart so at most a
// couple share the frame at once.
export function createClouds() {
  const rng = mulberry32(2024);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe7b26c,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    fog: false,
  });
  const SPAN = 400;
  const clouds = [];
  for (let i = 0; i < 3; i++) {
    const lobes = 3 + ((rng() * 2) | 0);
    const geos = [];
    for (let j = 0; j < lobes; j++) {
      const g = new THREE.CircleGeometry(3 + rng() * 2.2, 16);
      g.scale(2.7, 0.42, 1); // wide and shallow
      g.translate((j - lobes / 2) * 4.2 + (rng() - 0.5) * 2.5, (rng() - 0.5) * 0.9, 0);
      geos.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.renderOrder = -0.5; // in front of the sky, behind the birds
    const y = 40 + rng() * 18;
    const z = -125 - rng() * 70;
    const x0 = -SPAN / 2 + i * (SPAN / 3) + rng() * 26;
    mesh.position.set(x0, y, z);
    group.add(mesh);
    clouds.push({ mesh, x0, speed: 0.5 + rng() * 0.4 });
  }

  function update(t) {
    for (const c of clouds) {
      c.mesh.position.x = ((((c.x0 - c.speed * t) % SPAN) + SPAN * 1.5) % SPAN) - SPAN / 2;
    }
  }

  return { group, update };
}

// --- Dragon (periodic flyby) ------------------------------------------------
// A great winged silhouette that soars across the high sky now and then (a nod
// to Pendragon), on a timer like the mountain's yeti. Built as a wyvern so it
// stays legible from the fixed side-on view: a tapered body, a serpentine
// horned head, a barbed tail, spined back, and big scalloped bat wings that
// span into the screen (held in a dihedral so they never go edge-on) and beat
// slowly on time.
export function createDragon() {
  const MAT = new THREE.MeshBasicMaterial({ color: 0x130c05, side: THREE.DoubleSide });
  const g = new THREE.Group();

  // Body: a tapered spindle along X (head toward -X, tail toward +X).
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.64, 2.6, 6), MAT);
  chest.rotation.z = Math.PI / 2;
  chest.position.x = -0.5;
  const rump = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.16, 2.4, 6), MAT);
  rump.rotation.z = Math.PI / 2;
  rump.position.x = 1.7;
  g.add(chest, rump);

  // Serpentine neck, horned head with a jaw.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 2.0, 6), MAT);
  neck.position.set(-2.05, 0.5, 0);
  neck.rotation.z = 0.9;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 5), MAT);
  head.position.set(-3.05, 1.05, 0);
  head.rotation.z = -1.25;
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 4), MAT);
  jaw.position.set(-3.5, 0.78, 0);
  jaw.rotation.z = -1.95;
  g.add(neck, head, jaw);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), MAT);
    horn.position.set(-2.8, 1.45, s * 0.16);
    horn.rotation.z = 0.5;
    g.add(horn);
  }

  // Long tail tapering to a barbed spade tip.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 4.4, 5), MAT);
  tail.rotation.z = -Math.PI / 2;
  tail.position.set(4.9, -0.1, 0);
  const barb = new THREE.BufferGeometry();
  barb.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [6.6, -0.1, 0, 7.7, 0.45, 0, 8.2, -0.1, 0, 6.6, -0.1, 0, 8.2, -0.1, 0, 7.7, -0.65, 0],
      3,
    ),
  );
  g.add(tail, new THREE.Mesh(barb, MAT));

  // A row of spines down the back.
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 4), MAT);
    sp.position.set(-1.1 + i * 0.7, 0.55 + Math.max(0, 0.4 - Math.abs(i - 2) * 0.1), 0);
    g.add(sp);
  }

  // Scalloped bat wings in the XZ plane (span into the screen), fanned from the
  // shoulder. Beat about X; a dihedral keeps them presenting area side-on.
  function wing() {
    const rim = [
      [0.5, 0.2], [1.3, 2.2], [1.7, 4.7], [0.4, 4.5], [-0.4, 3.0], [0.1, 2.6], [-0.7, 1.3], [-0.2, 0.9],
    ];
    const pos = [];
    for (let i = 0; i < rim.length - 1; i++) {
      pos.push(0, 0, 0, rim[i][0], 0, rim[i][1], rim[i + 1][0], 0, rim[i + 1][1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geo, MAT);
  }
  const R = new THREE.Group();
  R.add(wing());
  R.position.set(0.1, 0.45, 0);
  const L = new THREE.Group();
  const lw = wing();
  lw.scale.z = -1;
  L.add(lw);
  L.position.set(0.1, 0.45, 0);
  g.add(R, L);

  g.scale.setScalar(1.7);
  g.visible = false;

  const PERIOD = 44; // seconds between flybys
  const DUR = 15; // seconds to cross
  const DIHEDRAL = 0.42;

  function update(t) {
    const localT = t % PERIOD;
    if (localT > DUR) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const u = localT / DUR; // 0..1 across, right to left
    g.position.set(180 - u * 360, 46 + Math.sin(u * Math.PI * 3) * 4 + Math.sin(t * 0.6) * 0.6, -150);
    const beat = Math.sin(t * 2.3) * 0.7;
    R.rotation.x = -DIHEDRAL + beat;
    L.rotation.x = DIHEDRAL - beat;
    g.rotation.z = Math.sin(t * 2.3) * 0.03;
  }

  return { group: g, update };
}
