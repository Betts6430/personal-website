import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ROAD_Z,
  ARTHUR_Z,
  groundY,
  mulberry32,
  TRAVEL,
  X_TRIG,
  PROJECT_CROSS,
  SIGN_CROSS,
} from './world.js';
import { PROJECTS } from './projects.js';

// The marching column: King Arthur leading out front, a dense, distant crowd
// of pike-bearing soldiers behind him, a few cavalry and supply carts for
// variety, and six banner-carts (one per project) flying a distinct colored
// flag. The whole column advances with the scroll (position = pure function
// of p), and the gait is driven by distance travelled, not elapsed time, so
// legs and wheels only move while the column is actually moving; hold the
// scroll still and the army stands.
//
// Everything but the flags is a warm near-black silhouette; the low sun rims
// the edges. The flags are flat, unlit color so the cue stays vivid.

// --- Shared materials -------------------------------------------------------
const MAT_BODY = new THREE.MeshStandardMaterial({ color: 0x2a1c11, flatShading: true });
const MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x1c130a, flatShading: true });
const MAT_GOLD = new THREE.MeshBasicMaterial({ color: 0xffce6a }); // Arthur's regalia
const MAT_BLADE = new THREE.MeshBasicMaterial({ color: 0xffe6b0 }); // Excalibur
const MAT_CAPE = new THREE.MeshStandardMaterial({
  color: 0x5a3d18,
  side: THREE.DoubleSide,
  flatShading: true,
});

// Steps per world unit travelled: the gait cadence, tied to distance so it
// stops when the column stops. Kept low so the march reads as an unhurried,
// long stride rather than a scurry.
const STRIDE_K = 2.2;

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
WHEEL_GEO.rotateX(Math.PI / 2);

const X_OFF_LEFT = -58; // cull once fully off the left
const X_OFF_RIGHT = 64; // cull until it enters from the right

/** A limb that pivots at its top: rotate the returned group about Z to swing it. */
function limb(w, h, d, mat) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = -h / 2;
  m.castShadow = true;
  g.add(m);
  return g;
}

// --- Instanced crowd of foot soldiers ---------------------------------------
// The bulk of the army. One merged silhouette (torso, head, pointed helm, a
// static mid-stride, a shouldered pike) instanced hundreds of times: the row
// of pikes is what reads as a great host. Legs are baked (no articulation:
// invisible at this distance), and each figure bobs with travel so the mass
// breathes as it advances but stands still when the scroll is held.

function soldierGeometry() {
  const torso = new THREE.BoxGeometry(0.52, 0.86, 0.34);
  torso.translate(0, 1.15, 0);
  const head = new THREE.BoxGeometry(0.27, 0.29, 0.27);
  head.translate(0, 1.73, 0);
  const helm = new THREE.ConeGeometry(0.21, 0.36, 6);
  helm.translate(0, 2.0, 0);
  const legL = new THREE.BoxGeometry(0.18, 0.74, 0.2);
  legL.translate(0, -0.37, 0);
  legL.rotateZ(0.3);
  legL.translate(0, 0.74, 0.1);
  const legR = new THREE.BoxGeometry(0.18, 0.74, 0.2);
  legR.translate(0, -0.37, 0);
  legR.rotateZ(-0.3);
  legR.translate(0, 0.74, -0.1);
  const pike = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5);
  pike.rotateZ(0.13);
  pike.translate(0.17, 1.6, 0);
  return mergeGeometries([torso, head, helm, legL, legR, pike]);
}

function makeCrowd(rng) {
  const people = [];
  for (let x = 45; x < 344; x += 1.7 + rng() * 1.5) {
    const ranks = rng() < 0.6 ? 2 : 1;
    for (let r = 0; r < ranks; r++) {
      people.push({
        x0: x + (rng() - 0.5) * 1.3,
        z: ROAD_Z + (rng() * 2 - 1) * 4.2,
        ph: rng() * Math.PI * 2,
        s: 0.85 + rng() * 0.3,
      });
    }
  }

  const mesh = new THREE.InstancedMesh(soldierGeometry(), MAT_BODY, people.length);
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const ZERO = new THREE.Vector3(0, 0, 0);

  function update(offset) {
    for (let i = 0; i < people.length; i++) {
      const c = people[i];
      const x = c.x0 - offset;
      if (x < X_OFF_LEFT || x > X_OFF_RIGHT) {
        m.compose(pos.set(0, -999, 0), q, scl.copy(ZERO));
        mesh.setMatrixAt(i, m);
        continue;
      }
      const y = groundY(x, c.z) + 0.05 * Math.abs(Math.sin(x * STRIDE_K + c.ph));
      m.compose(pos.set(x, y, c.z), q, scl.set(c.s, c.s, c.s));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}

// --- Horse (with an optional rider) -----------------------------------------

function makeHorse(rng, rider) {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.5), MAT_DARK);
  body.position.y = 1.15;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.3), MAT_DARK);
  neck.position.set(-0.72, 1.5, 0);
  neck.rotation.z = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.24), MAT_DARK);
  head.position.set(-1.04, 1.74, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), MAT_DARK);
  tail.position.set(0.78, 1.16, 0);
  tail.rotation.z = -0.6;
  [body, neck, head, tail].forEach((m) => (m.castShadow = true));
  g.add(body, neck, head, tail);

  const legs = [];
  let i = 0;
  for (const lx of [-0.55, 0.55]) {
    for (const lz of [0.22, -0.22]) {
      const leg = limb(0.14, 0.95, 0.16, MAT_DARK);
      leg.position.set(lx, 0.95, lz);
      legs.push({ leg, ph: (i % 2) * Math.PI });
      g.add(leg);
      i++;
    }
  }

  if (rider) {
    const rt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.32), MAT_BODY);
    rt.position.set(0.05, 1.95, 0);
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), MAT_BODY);
    rh.position.set(0.05, 2.48, 0);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 6), MAT_DARK);
    helm.position.set(0.05, 2.72, 0);
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 5), MAT_DARK);
    lance.position.set(-0.2, 2.4, 0);
    lance.rotation.z = 0.2;
    [rt, rh, helm, lance].forEach((m) => (m.castShadow = true));
    g.add(rt, rh, helm, lance);
  }

  const ph0 = rng() * Math.PI * 2;
  function anim(worldX) {
    for (const L of legs) L.leg.rotation.z = 0.42 * Math.sin(worldX * STRIDE_K + ph0 + L.ph);
  }
  return { group: g, anim, ph: ph0 };
}

// --- Cart (supply, or a banner-cart when given a flag color) -----------------

function makeCart(rng, flagColor) {
  const g = new THREE.Group();

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.75), MAT_DARK);
  bed.position.y = 0.95;
  bed.castShadow = true;
  g.add(bed);

  const wheels = [];
  for (const wx of [0.6, -0.6]) {
    for (const wz of [0.44, -0.44]) {
      const w = new THREE.Mesh(WHEEL_GEO, MAT_DARK);
      w.position.set(wx, 0.42, wz);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
  }

  for (let i = 0; i < 2; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.52, 8), MAT_BODY);
    barrel.position.set(-0.42 + i * 0.72, 1.42, 0);
    barrel.castShadow = true;
    g.add(barrel);
  }

  const horse = makeHorse(rng, false);
  horse.group.position.set(-1.9, 0, 0);
  g.add(horse.group);

  let flag = null;
  let flagBaseX = null;
  if (flagColor) {
    // Tall so it stands clear above the distant crowd: the flag is the cue.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 6.4, 6), MAT_DARK);
    pole.position.set(0.55, 1.2 + 3.2, 0);
    pole.castShadow = true;
    g.add(pole);

    const flagMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(flagColor),
      side: THREE.DoubleSide,
    });
    const flagGeo = new THREE.PlaneGeometry(1.9, 1.2, 8, 1);
    flagGeo.translate(0.95, 0, 0); // left edge at the pole; flies back toward +X
    flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.6, 6.7, 0);
    g.add(flag);
    flagBaseX = flagGeo.attributes.position.array.slice();
  }

  function anim(worldX, time) {
    const spin = worldX / 0.42; // wheels roll with travel
    for (const w of wheels) w.rotation.z = spin;
    horse.anim(worldX);
    if (flag) {
      // Flags flutter in the wind regardless of the march, so this one alone
      // is a gentle function of time.
      const p = flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = flagBaseX[i * 3];
        p.setZ(i, Math.sin(bx * 2.4 - time * 5.0) * 0.14 * bx);
      }
      p.needsUpdate = true;
    }
  }
  return { group: g, anim, ph: 0 };
}

// --- Waysign cart (trailing "Home" / "Timeline" signposts) ------------------
// A supply cart carrying a big wooden signboard on two posts. The board's face
// is a canvas texture (a carved plank), fog-exempt so the lettering stays crisp
// and readable; the whole board is clickable (raycast in main.js) to leave for
// that scene. These trail the host and cross late, so the scroll ends on them.

function makeSignTexture(label) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#caa25c'; // sun-warmed plank
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#3f2a12';
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = '#2f1e0c';
  ctx.font = 'bold 118px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

function makeSignCart(rng, label) {
  const g = new THREE.Group();

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.75), MAT_DARK);
  bed.position.y = 0.95;
  bed.castShadow = true;
  g.add(bed);

  const wheels = [];
  for (const wx of [0.6, -0.6]) {
    for (const wz of [0.44, -0.44]) {
      const w = new THREE.Mesh(WHEEL_GEO, MAT_DARK);
      w.position.set(wx, 0.42, wz);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
  }

  const horse = makeHorse(rng, false);
  horse.group.position.set(-1.9, 0, 0);
  g.add(horse.group);

  const BOARD_Y = 5.0;
  for (const px of [-1.0, 1.0]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.8, 6), MAT_DARK);
    post.position.set(px, 1.0 + 2.4, 0);
    post.castShadow = true;
    g.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 2.4),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(label), side: THREE.DoubleSide, fog: false }),
  );
  board.position.set(0, BOARD_Y, 0.14);
  g.add(board);

  function anim(worldX) {
    const spin = worldX / 0.42;
    for (const w of wheels) w.rotation.z = spin;
    horse.anim(worldX);
  }
  return { group: g, anim, ph: 0, board };
}

// --- King Arthur ------------------------------------------------------------

function makeArthur(rng) {
  const g = new THREE.Group();

  const horse = makeHorse(rng, false);
  g.add(horse.group);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.86, 0.34), MAT_BODY);
  torso.position.set(0.05, 1.98, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), MAT_BODY);
  head.position.set(0.05, 2.52, 0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 8), MAT_GOLD);
  crown.position.set(0.05, 2.75, 0);
  [torso, head].forEach((m) => (m.castShadow = true));

  // Excalibur raised: a bright blade and gold cross-guard held aloft.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), MAT_BODY);
  arm.position.set(-0.15, 2.4, 0);
  arm.rotation.z = 0.7;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), MAT_GOLD);
  guard.position.set(-0.42, 2.78, 0);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.05), MAT_BLADE);
  blade.position.set(-0.42, 3.6, 0);
  blade.castShadow = true;

  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.1), MAT_CAPE);
  cape.position.set(0.34, 1.75, 0);
  cape.rotation.y = Math.PI / 2;

  // A glint sprite at the blade tip, flared briefly when Arthur is clicked: a
  // soft radial core with a cross streak, not a flat quad.
  const glintMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xfff2d0) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float streak = smoothstep(0.035, 0.0, abs(d.x)) + smoothstep(0.035, 0.0, abs(d.y));
        float a = (core * core + streak * core * 0.6) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glintMat);
  glint.position.set(-0.42, 4.45, 0.12);
  g.add(torso, head, crown, arm, guard, blade, cape, glint);
  // Scaled up so he still leads large now that he shares the host's road depth.
  g.scale.setScalar(1.5);

  return { group: g, anim: horse.anim, ph: horse.ph, glint };
}

// --- The whole column -------------------------------------------------------

export function createColumn() {
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  const units = [];

  const crowd = makeCrowd(rng);
  group.add(crowd.mesh);

  function place(unit, x0, z) {
    unit.x0 = x0;
    unit.z = z;
    group.add(unit.group);
    units.push(unit);
  }

  // Banner-carts: one per project, positioned so each crosses X_TRIG exactly
  // at its PROJECT_CROSS p.
  const cartXs = [];
  PROJECTS.forEach((proj, i) => {
    const x0 = X_TRIG + TRAVEL * PROJECT_CROSS[i];
    cartXs.push(x0);
    place(makeCart(rng, proj.flag), x0, ROAD_Z + 0.4);
  });

  // Arthur leads out front on the nearer track (bigger via perspective), with
  // a clear gap of open road behind him before the host.
  const arthur = makeArthur(rng);
  place(arthur, 16, ARTHUR_Z);

  // Two waysign-carts bringing up the rear: Home (back to the mountain) and
  // Timeline. Placed so each crosses X_TRIG at its SIGN_CROSS p, they are the
  // last units the march presents. Their boards are exposed for click routing.
  const signDefs = [
    { label: 'Home', href: 'index.html', cross: SIGN_CROSS[0] },
    { label: 'Timeline', href: 'timeline.html', cross: SIGN_CROSS[1] },
  ];
  const signs = [];
  for (const sd of signDefs) {
    const cart = makeSignCart(rng, sd.label);
    const x0 = X_TRIG + TRAVEL * sd.cross;
    cartXs.push(x0);
    place(cart, x0, ROAD_Z + 0.4);
    signs.push({ mesh: cart.board, href: sd.href });
  }

  // A few cavalry and supply carts scattered through the host for variety,
  // avoiding the banner-cart and sign-cart slots.
  for (let x = 46; x < 340; x += 10 + rng() * 12) {
    if (cartXs.some((cx) => Math.abs(cx - x) < 4)) continue;
    const unit = rng() < 0.6 ? makeHorse(rng, true) : makeCart(rng, null);
    place(unit, x, ROAD_Z + (rng() * 2 - 1) * 3.4);
  }

  let glintTime = -999;
  function glint(t) {
    glintTime = t;
  }

  function update(p, time) {
    const offset = TRAVEL * p;
    crowd.update(offset);
    for (const u of units) {
      const x = u.x0 - offset;
      if (x < X_OFF_LEFT || x > X_OFF_RIGHT) {
        u.group.visible = false;
        continue;
      }
      u.group.visible = true;
      const y = groundY(x, u.z) + 0.05 * Math.abs(Math.sin(x * STRIDE_K + u.ph));
      u.group.position.set(x, y, u.z);
      u.anim(x, time);
    }

    // Excalibur glint: a brief flare on the blade after Arthur is clicked, a
    // pure function of time since the click so it resolves cleanly every time.
    const gd = time - glintTime;
    if (gd >= 0 && gd < 0.85) {
      const k = Math.sin((gd / 0.85) * Math.PI);
      arthur.glint.material.uniforms.uOpacity.value = k;
      arthur.glint.scale.setScalar(0.6 + k * 1.1);
    } else {
      arthur.glint.material.uniforms.uOpacity.value = 0;
    }
  }

  return { group, update, arthur: arthur.group, glint, signs };
}
