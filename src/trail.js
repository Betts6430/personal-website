import * as THREE from 'three';
import { poseAt } from './world.js';

// The carve track the board cuts into the snow. Because the path is a pure
// function of timeline p, the whole ribbon is built once up front; each
// frame just moves drawRange so exactly the ridden portion is visible.
// Scrolling back up un-draws it in perfect sync.

const SEGMENTS = 800;
const WIDTH = 0.42;
const LIFT = 0.04; // sit just above the snow to avoid z-fighting

export function buildTrail() {
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const indices = [];
  const lateral = new THREE.Vector3();

  for (let i = 0; i <= SEGMENTS; i++) {
    const s = poseAt(i / SEGMENTS);
    // Horizontal direction of travel -> lateral for the ribbon edges.
    lateral.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)).multiplyScalar(WIDTH / 2);
    const y = s.y + LIFT;
    positions[i * 6] = s.x - lateral.x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = s.z - lateral.z;
    positions[i * 6 + 3] = s.x + lateral.x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = s.z + lateral.z;
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.setDrawRange(0, 0);

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xc7dcec, side: THREE.DoubleSide }),
  );
  mesh.frustumCulled = false;

  /** Reveal the track up to timeline value p. */
  function update(p) {
    const upto = Math.max(0, Math.min(SEGMENTS, Math.floor(p * SEGMENTS)));
    geo.setDrawRange(0, upto * 6);
  }

  return { mesh, update };
}
