import * as THREE from 'three';
import { poseAt, smoothstep } from './world.js';

// The carve track the board cuts into the snow: a shallow V groove riding
// just above the hill so it never clips into it. The two tilted walls
// catch the directional sun unevenly (one lit, one shaded) and a vertex
// tint darkens the trough, so the track reads as carved snow rather than
// a painted stripe. Contrast and lip height taper with distance up the
// run, so the far track sits faint in the snow and the fresh track near
// the camera is crisp. Because the path is a pure function of timeline p,
// the whole ribbon is built once up front; each frame just moves
// drawRange so exactly the ridden portion is visible. Scrolling back up
// un-draws it in perfect sync.
//
// The one deliberate exception to statelessness: rings revealed while the
// rider is mid-trick (airborne) are sunk below the surface, leaving a gap
// where the board never touched snow. Reverse scroll restores sunk rings
// as it un-draws them, so scrubbing back and riding the stretch again
// heals the trail.

const SEGMENTS = 800;
const HALF_W = 0.27;
const LIP = 0.12; // lip height above the snow surface
const DIP = 0.02; // trough height, kept above the hill to avoid clipping
const SINK = 0.25; // how far a gap ring hides below the surface
const LIP_TINT = new THREE.Color(0xffffff);
const DIP_TINT = new THREE.Color(0x8fb4cf);

export function buildTrail() {
  const positions = new Float32Array((SEGMENTS + 1) * 3 * 3);
  const baseY = new Float32Array((SEGMENTS + 1) * 3);
  const colors = new Float32Array((SEGMENTS + 1) * 3 * 3);
  const indices = [];
  const lateral = new THREE.Vector3();
  const dip = new THREE.Color();

  for (let i = 0; i <= SEGMENTS; i++) {
    const s = poseAt(i / SEGMENTS);
    // Far up the run the groove flattens and its tint fades toward the
    // snow, so old track reads as settled rather than freshly cut.
    const near = smoothstep((s.z + 180) / 120);
    const lipH = LIP * (0.45 + 0.55 * near);
    dip.copy(LIP_TINT).lerp(DIP_TINT, 0.25 + 0.75 * near);
    // Horizontal direction of travel -> lateral for the groove edges.
    lateral.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)).multiplyScalar(HALF_W);
    const o = i * 9;
    positions[o] = s.x - lateral.x;
    positions[o + 1] = s.y + lipH;
    positions[o + 2] = s.z - lateral.z;
    positions[o + 3] = s.x;
    positions[o + 4] = s.y + DIP;
    positions[o + 5] = s.z;
    positions[o + 6] = s.x + lateral.x;
    positions[o + 7] = s.y + lipH;
    positions[o + 8] = s.z + lateral.z;
    baseY[i * 3] = positions[o + 1];
    baseY[i * 3 + 1] = positions[o + 4];
    baseY[i * 3 + 2] = positions[o + 7];
    LIP_TINT.toArray(colors, o);
    dip.toArray(colors, o + 3);
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

  let lastUpto = 0;

  function setRingY(i, offset) {
    positions[i * 9 + 1] = baseY[i * 3] + offset;
    positions[i * 9 + 4] = baseY[i * 3 + 1] + offset;
    positions[i * 9 + 7] = baseY[i * 3 + 2] + offset;
  }

  /**
   * Reveal the track up to timeline value p. Rings that come into view
   * while the board is off the snow are sunk out of sight; un-drawing
   * them (reverse scroll) restores them for the next pass.
   */
  function update(p, airborne = false) {
    const upto = Math.max(0, Math.min(SEGMENTS, Math.floor(p * SEGMENTS)));
    if (upto > lastUpto) {
      if (airborne) {
        for (let i = lastUpto + 1; i <= upto; i++) setRingY(i, -SINK);
        geo.attributes.position.needsUpdate = true;
      }
    } else if (upto < lastUpto) {
      for (let i = upto + 1; i <= lastUpto; i++) setRingY(i, 0);
      geo.attributes.position.needsUpdate = true;
    }
    lastUpto = upto;
    geo.setDrawRange(0, upto * 12);
  }

  return { mesh, update };
}
