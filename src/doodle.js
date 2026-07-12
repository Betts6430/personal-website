import * as THREE from 'three';
import { SLOPE, surfaceY } from './world.js';
import { createSpray } from './spray.js';

// Cursor doodles: the pointer acts like a glove dragged through the powder.
// Each frame the pointer is projected onto the snow surface; when it moves
// it kicks up a small plume (its own spray pool) and leaves a dotted carve
// line that fades out after a few seconds. Everything here is transient and
// time-based, like the snowfall, so the "any p renders the same frame"
// scroll invariant is untouched: wait a moment and the snow is pristine.

const MAX_DOTS = 1200;
const DOT_LIFE = 4.5; // seconds a line dot stays visible
const STEP = 0.3; // world units between dots along a stroke
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
    uColor: { value: new THREE.Color(0xc7dcec) }, // matches the carve trail
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
      uniform vec3 uColor;
      varying float vFade;
      void main() {
        // Kept faint: strokes overlap heavily, so per-dot alpha stacks up.
        float a = smoothstep(0.5, 0.3, length(gl_PointCoord - 0.5)) * vFade * 0.38;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const dots = new THREE.Points(geo, material);
  dots.frustumCulled = false;
  group.add(dots);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const stroke = new THREE.Vector3();
  const plumeVel = new THREE.Vector3();
  let hasPrev = false;
  let pointerMoved = false;
  let head = 0;

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
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
          prev.copy(hit);
          hasPrev = true;
        } else {
          const dist = hit.distanceTo(prev);
          if (dist >= STEP) {
            const steps = Math.min(60, Math.floor(dist / STEP));
            for (let k = 1; k <= steps; k++) {
              const f = k / steps;
              addDot(prev.x + (hit.x - prev.x) * f, prev.z + (hit.z - prev.z) * f, time);
            }
            stroke.subVectors(hit, prev).normalize();
            plumeVel.set(stroke.x * 1.7, 1.25, stroke.z * 1.7);
            powder.emit(hit, plumeVel, Math.min(4, 1 + (steps >> 1)));
            prev.copy(hit);
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

  return { group, onPointerMove, update };
}
