import * as THREE from 'three';

// Snow spray kicked up by the board edge. A fixed-size particle pool in a
// ring buffer; dead particles are parked far below the hill. Emission rate
// is decided by the caller (it scales with scroll speed and carve depth).

const MAX = 500;
const GRAVITY = 5;
const PARKED_Y = -9999;

export function createSpray(texture) {
  const positions = new Float32Array(MAX * 3);
  const velocities = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = PARKED_Y;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.35,
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;

  let head = 0;

  /** Spawn n particles at origin with base velocity, randomized a little. */
  function emit(origin, baseVel, n) {
    for (let k = 0; k < n; k++) {
      const i = head;
      head = (head + 1) % MAX;
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = origin.y + Math.random() * 0.15;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;
      velocities[i * 3] = baseVel.x * (0.6 + Math.random() * 0.8);
      velocities[i * 3 + 1] = baseVel.y * (0.7 + Math.random() * 0.6);
      velocities[i * 3 + 2] = baseVel.z * (0.6 + Math.random() * 0.8);
      life[i] = 0.55 + Math.random() * 0.4;
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = PARKED_Y;
        continue;
      }
      velocities[i * 3 + 1] -= GRAVITY * dt;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { points, emit, update };
}
