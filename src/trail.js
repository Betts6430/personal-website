import * as THREE from 'three';
import { poseAt } from './world.js';

// The carve track the board cuts into the snow: a shallow V groove riding
// just above the hill so it never clips into it. The two tilted walls
// catch the directional sun unevenly (one lit, one shaded) and a vertex
// tint darkens the trough, so the track reads as carved snow rather than
// a painted stripe. Because the path is a pure function of timeline p,
// the whole ribbon is built once up front; each frame just moves
// drawRange so exactly the ridden portion is visible. Scrolling back up
// un-draws it in perfect sync.

const SEGMENTS = 800;
const HALF_W = 0.27;
const LIP = 0.12; // lip height above the snow surface
const DIP = 0.02; // trough height, kept above the hill to avoid clipping
const LIP_TINT = new THREE.Color(0xffffff);
const DIP_TINT = new THREE.Color(0x8fb4cf);

export function buildTrail() {
  const positions = new Float32Array((SEGMENTS + 1) * 3 * 3);
  const colors = new Float32Array((SEGMENTS + 1) * 3 * 3);
  const indices = [];
  const lateral = new THREE.Vector3();

  for (let i = 0; i <= SEGMENTS; i++) {
    const s = poseAt(i / SEGMENTS);
    // Horizontal direction of travel -> lateral for the groove edges.
    lateral.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)).multiplyScalar(HALF_W);
    const o = i * 9;
    positions[o] = s.x - lateral.x;
    positions[o + 1] = s.y + LIP;
    positions[o + 2] = s.z - lateral.z;
    positions[o + 3] = s.x;
    positions[o + 4] = s.y + DIP;
    positions[o + 5] = s.z;
    positions[o + 6] = s.x + lateral.x;
    positions[o + 7] = s.y + LIP;
    positions[o + 8] = s.z + lateral.z;
    LIP_TINT.toArray(colors, o);
    DIP_TINT.toArray(colors, o + 3);
    LIP_TINT.toArray(colors, o + 6);
    if (i < SEGMENTS) {
      const a = i * 3;
      indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); // left wall
      indices.push(a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); // right wall
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.setDrawRange(0, 0);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xf0f7fc,
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;

  /** Reveal the track up to timeline value p. */
  function update(p) {
    const upto = Math.max(0, Math.min(SEGMENTS, Math.floor(p * SEGMENTS)));
    geo.setDrawRange(0, upto * 12);
  }

  return { mesh, update };
}
