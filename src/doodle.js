import * as THREE from 'three';
import { SLOPE, surfaceY } from './world.js';
import { createSpray } from './spray.js';

// Cursor doodles: click and drag to pull a glove through the powder. While
// the button is held, the pointer is projected onto the snow surface; as it
// moves it kicks up a small plume (its own spray pool) and presses an
// embossed carve line into the snow that fades out after a few seconds
// (overlapping shaded sprites, matching the rider's groove). Everything is
// transient and time-based, like the snowfall, so the "any p renders the
// same frame" scroll invariant is untouched: let go and the snow heals.

const MAX_DOTS = 2600;
const DOT_LIFE = 4.5; // seconds a line dot stays visible
const STEP = 0.12; // world units between dots; dots are 3x wider, so they
// overlap into a continuous groove instead of a bead chain
const MAX_RANGE = 250; // ignore hits out past the fog
const LIFT = 0.05; // sit just above the snow (and the carve trail)

const TAN_SLOPE = Math.tan(SLOPE);

export function createSnowDoodle(texture) {
  const group = new THREE.Group();

  const powder = createSpray(texture);
  group.add(powder.points);

  const positions = new Float32Array(MAX_DOTS * 3);
  const born = new Float32Array(MAX_DOTS).fill(-1e9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aBorn', new THREE.BufferAttribute(born, 1));

  const uniforms = {
    uTime: { value: 0 },
    uLife: { value: DOT_LIFE },
    uScale: { value: 1 },
    // Trough shade and lip light, matching the rider's carved trail.
    uDark: { value: new THREE.Color(0x99bcd4) },
    uLight: { value: new THREE.Color(0xf6fbff) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aBorn;
      uniform float uTime, uLife, uScale;
      varying float vFade;
      void main() {
        float age = uTime - aBorn;
        vFade = 1.0 - clamp(age / uLife, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Fade toward the fog so far dots do not stay unnaturally crisp.
        vFade *= 1.0 - smoothstep(180.0, 250.0, -mv.z);
        gl_PointSize = 0.36 * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDark;
      uniform vec3 uLight;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float mask = smoothstep(0.5, 0.34, length(d));
        // Fake an indentation: the scene sun sits screen upper-right, so
        // inside a depression the upper-right wall falls into shade and
        // the lower-left wall catches light (gl_PointCoord y runs down).
        float shade = clamp(0.5 + 1.8 * dot(d, vec2(0.707, -0.707)), 0.0, 1.0);
        vec3 col = mix(uLight, uDark, shade);
        float a = mask * vFade * 0.5;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const dots = new THREE.Points(geo, material);
  dots.frustumCulled = false;
  group.add(dots);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const pen = new THREE.Vector3(); // last laid dot; walks toward each hit
  const stroke = new THREE.Vector3();
  const plumeVel = new THREE.Vector3();
  let hasPrev = false;
  let pointerMoved = false;
  let drawing = false;
  let head = 0;

  function onPointerDown(e) {
    if (e.pointerType === 'touch') return; // touch drags are for scrolling
    drawing = true;
    hasPrev = false;
    onPointerMove(e);
  }

  function onPointerUp() {
    drawing = false;
    hasPrev = false;
  }

  function onPointerMove(e) {
    if (!drawing || e.pointerType === 'touch') return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
    pointerMoved = true;
  }

  /** Cast the pointer ray onto the bumpy snow surface. */
  function projectToSnow(camera, out) {
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    const denom = direction.y + TAN_SLOPE * direction.z;
    if (Math.abs(denom) < 1e-5) return false;
    // Exact hit on the smooth slope, then a couple of Newton steps to
    // account for the terrain bumps on the flanks.
    let t = -(origin.y + TAN_SLOPE * origin.z) / denom;
    for (let i = 0; i < 2; i++) {
      if (t <= 0) return false;
      out.copy(direction).multiplyScalar(t).add(origin);
      t += (surfaceY(out.x, out.z) - out.y) / denom;
    }
    if (t <= 0 || t > MAX_RANGE) return false;
    out.copy(direction).multiplyScalar(t).add(origin);
    return true;
  }

  function addDot(x, z, time) {
    positions[head * 3] = x;
    positions[head * 3 + 1] = surfaceY(x, z) + LIFT;
    positions[head * 3 + 2] = z;
    born[head] = time;
    head = (head + 1) % MAX_DOTS;
  }

  function update(camera, time, dt) {
    uniforms.uTime.value = time;
    uniforms.uScale.value =
      (window.innerHeight * Math.min(window.devicePixelRatio, 2)) /
      (2 * Math.tan((camera.fov * Math.PI) / 360));

    if (pointerMoved) {
      pointerMoved = false;
      if (projectToSnow(camera, hit)) {
        if (!hasPrev) {
          pen.copy(hit);
          hasPrev = true;
        } else {
          // Walk the pen toward the hit in exact STEP increments; the
          // sub-STEP remainder carries into the next event, so spacing
          // stays uniform no matter how the pointer moves.
          stroke.subVectors(hit, pen);
          const dist = stroke.length();
          if (dist >= STEP) {
            stroke.divideScalar(dist);
            const n = Math.floor(dist / STEP);
            const count = Math.min(240, n);
            const step = n > count ? dist / count : STEP;
            for (let k = 0; k < count; k++) {
              pen.addScaledVector(stroke, step);
              addDot(pen.x, pen.z, time);
            }
            plumeVel.set(stroke.x * 1.7, 1.25, stroke.z * 1.7);
            powder.emit(hit, plumeVel, Math.min(4, 1 + (count >> 2)));
            geo.attributes.position.needsUpdate = true;
            geo.attributes.aBorn.needsUpdate = true;
          }
        }
      } else {
        hasPrev = false;
      }
    }

    powder.update(dt);
  }

  return { group, onPointerDown, onPointerUp, onPointerMove, update };
}
