import * as THREE from 'three';

// The snowboarder: stylized low-poly, built from primitives, posed
// procedurally every frame. Regular stance, chest facing local +X, riding
// toward local +Z. The root group's yaw/pitch/roll are set by main.js from
// the path; update() poses the body inside that leaned frame.
//
// Legs and arms use analytic 2-bone IK: ankles are pinned to the boots and
// hands chase balance targets; the middle joint (knee/elbow) is solved so
// both segments always connect exactly. Limbs are unit cylinders stretched
// between joint points, with small spheres capping the joints.
//
// update() takes a rest factor (0 riding, 1 settled at the finale stop)
// that relaxes the pose: arms drop to the sides and the head straightens
// so the contact bib presents cleanly.

const JACKET = 0x5ea3cd;
const JACKET_DARK = 0x2e6f9e;
const PANTS = 0x3f6480;
const DARK = 0x1d3547;
const HELMET = 0x161e27; // black shell; the white strap keeps it readable
const GOGGLE = 0x9fd0e8;
const SNOW = 0xf4f9fc;

const LEG_SEG = 0.4; // thigh and shin length
const ARM_UPPER = 0.34;
const ARM_FORE = 0.32;
const UP = new THREE.Vector3(0, 1, 0);

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true });
}

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

function ball(r, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat(color));
  m.castShadow = true;
  return m;
}

/**
 * Octagonal prism tapered along Y, with a flat facet (not an edge) centered
 * on each axis so the jacket back stays planar for the bib. halfX is the
 * vertex half-width across X; the Z vertex half-depth runs from botZ at the
 * bottom to topZ at the top. Flat facets sit at ~0.92 of these radii.
 */
function taperedPrism(halfX, h, topZ, botZ, color) {
  const geo = new THREE.CylinderGeometry(1, 1, h, 8, 1, false, Math.PI / 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y01 = pos.getY(i) / h + 0.5;
    pos.setX(i, pos.getX(i) * halfX);
    pos.setZ(i, pos.getZ(i) * (botZ + (topZ - botZ) * y01));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}

/** Unit-length cylinder with its base at the origin, pointing up +Y. */
function limb(rTip, rBase, color) {
  const geo = new THREE.CylinderGeometry(rTip, rBase, 1, 6);
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}

const _dir = new THREE.Vector3();

/** Stretch a limb mesh from point a to point b (both in parent space). */
function setLimb(mesh, a, b) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, _dir.normalize());
  mesh.scale.set(1, len, 1);
}

const _axis = new THREE.Vector3();
const _bend = new THREE.Vector3();

/**
 * Middle joint of a 2-bone chain from a to b with segment lengths l1, l2,
 * bulging toward bend (which need not be perpendicular to the chain).
 */
function solveJoint(out, a, b, l1, l2, bend) {
  _axis.subVectors(b, a);
  const d = Math.min(_axis.length(), (l1 + l2) * 0.999);
  _axis.normalize();
  const t = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  _bend.copy(bend).addScaledVector(_axis, -_axis.dot(bend)).normalize();
  const bulge = Math.sqrt(Math.max(l1 * l1 - t * t, 0.0004));
  out.copy(a).addScaledVector(_axis, t).addScaledVector(_bend, bulge);
  return out;
}

const KNEE_BEND = new THREE.Vector3(1, 0, 0);
const ELBOW_BEND_F = new THREE.Vector3(-1, -0.3, 0.35);
const ELBOW_BEND_B = new THREE.Vector3(-1, -0.3, -0.35);

/** One continuous low-poly board: rounded outline, kicked nose and tail. */
function buildBoard() {
  const half = 1.15;
  const w = 0.23;
  const s = new THREE.Shape();
  s.moveTo(-w, -half + 0.32);
  s.lineTo(-w * 0.94, 0); // subtle sidecut waist
  s.lineTo(-w, half - 0.32);
  s.quadraticCurveTo(-w, half, 0, half);
  s.quadraticCurveTo(w, half, w, half - 0.32);
  s.lineTo(w * 0.94, 0);
  s.lineTo(w, -half + 0.32);
  s.quadraticCurveTo(w, -half, 0, -half);
  s.quadraticCurveTo(-w, -half, -w, -half + 0.32);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.07,
    bevelEnabled: false,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2); // lie flat: length along Z, thickness up +Y
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.abs(pos.getZ(i)) - 0.78;
    if (k > 0) pos.setY(i, pos.getY(i) + k * k * 1.15);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(JACKET_DARK));
  m.castShadow = true;
  return m;
}

export function createRider() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  // --- Board ---
  const board = buildBoard();
  group.add(board);
  const stripe = box(0.09, 0.016, 1.5, GOGGLE);
  stripe.position.y = 0.078;
  group.add(stripe);

  // --- Bindings + boots (ankle anchors), toes toward the chest (+X) ---
  for (const [zPos, yawFoot] of [
    [0.44, 0.35],
    [-0.44, -0.12],
  ]) {
    const foot = new THREE.Group();
    foot.position.set(0, 0, zPos);
    foot.rotation.y = yawFoot;
    const plate = box(0.38, 0.06, 0.28, DARK);
    plate.position.y = 0.1;
    const boot = box(0.34, 0.26, 0.22, DARK);
    boot.position.set(0.02, 0.26, 0);
    const highback = box(0.05, 0.24, 0.2, DARK);
    highback.position.set(-0.18, 0.28, 0);
    highback.rotation.z = 0.3;
    const strap = box(0.2, 0.045, 0.24, JACKET_DARK);
    strap.position.set(0.08, 0.34, 0);
    strap.rotation.z = -0.55;
    foot.add(plate, boot, highback, strap);
    group.add(foot);
  }

  // --- Legs ---
  const shinF = limb(0.1, 0.12, PANTS);
  const thighF = limb(0.13, 0.11, PANTS);
  const shinB = limb(0.1, 0.12, PANTS);
  const thighB = limb(0.13, 0.11, PANTS);
  const kneeBallF = ball(0.105, PANTS);
  const kneeBallB = ball(0.105, PANTS);
  group.add(shinF, thighF, shinB, thighB, kneeBallF, kneeBallB);

  // --- Hips ---
  const hips = taperedPrism(0.2, 0.26, 0.29, 0.27, PANTS);
  group.add(hips);

  // --- Torso: rounded tapered jacket (flat back facet for the bib), hem,
  //     zipper, collar, folded hood ---
  const torsoG = new THREE.Group();
  const torso = taperedPrism(0.25, 0.85, 0.36, 0.26, JACKET);
  torso.position.y = 0.44;
  torsoG.add(torso);
  const hem = taperedPrism(0.265, 0.11, 0.28, 0.28, JACKET_DARK);
  hem.position.y = 0.05;
  torsoG.add(hem);
  const zipper = box(0.02, 0.62, 0.035, SNOW);
  zipper.position.set(0.235, 0.5, 0);
  torsoG.add(zipper);
  const collar = taperedPrism(0.17, 0.15, 0.2, 0.18, JACKET_DARK);
  collar.position.y = 0.9;
  torsoG.add(collar);
  const hood = box(0.09, 0.16, 0.3, JACKET_DARK);
  hood.position.set(-0.265, 0.87, 0);
  torsoG.add(hood);

  // --- Head: dark balaclava under a white helmet shell with a brim; wide
  //     wrap-around goggles (faceted cylinder-wall lens over a frame) with
  //     a strap ringing the helmet ---
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 6), mat(JACKET_DARK));
  neck.castShadow = true;
  neck.position.y = 0.99;
  torsoG.add(neck);
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.165, 7, 5), mat(DARK));
  face.castShadow = true;
  face.position.set(0.01, -0.02, 0);
  head.add(face);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.205, 8, 6), mat(HELMET));
  helmet.castShadow = true;
  helmet.position.set(-0.025, 0.035, 0);
  helmet.scale.y = 0.95;
  head.add(helmet);
  const brim = box(0.09, 0.04, 0.28, HELMET);
  brim.position.set(0.15, 0.125, 0);
  brim.rotation.z = -0.18;
  head.add(brim);
  const strap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.221, 0.221, 0.05, 10, 1, true),
    mat(SNOW),
  );
  strap.position.set(-0.025, 0.045, 0);
  head.add(strap);
  const goggleFrame = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.16, 6, 1, true, Math.PI / 2 - 1.25, 2.5),
    mat(DARK),
  );
  goggleFrame.position.y = 0.02;
  head.add(goggleFrame);
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.203, 0.203, 0.125, 6, 1, true, Math.PI / 2 - 1.1, 2.2),
    new THREE.MeshStandardMaterial({ color: GOGGLE, flatShading: true, roughness: 0.35 }),
  );
  lens.position.y = 0.025;
  head.add(lens);
  head.position.y = 1.14;
  torsoG.add(head);
  group.add(torsoG);

  // Invisible anchors just off the flat jacket back; main.js projects the
  // four corners to screen space and maps the contact bib onto them with a
  // homography, so the card sits on the jacket like pinned fabric.
  const bibAnchors = {};
  for (const key of ['tl', 'tr', 'bl', 'br']) {
    const o = new THREE.Object3D();
    torsoG.add(o);
    bibAnchors[key] = o;
  }
  /** Size the anchor quad (torso-local units) to the card's aspect ratio. */
  function layoutBib(halfW, halfH, centerY = 0.5) {
    const x = -0.28;
    bibAnchors.tl.position.set(x, centerY + halfH, -halfW);
    bibAnchors.tr.position.set(x, centerY + halfH, halfW);
    bibAnchors.bl.position.set(x, centerY - halfH, -halfW);
    bibAnchors.br.position.set(x, centerY - halfH, halfW);
  }
  layoutBib(0.34, 0.22);

  // --- Arms: 2-bone with elbows, joint caps, mitts ---
  const upperF = limb(0.08, 0.09, JACKET);
  const foreF = limb(0.07, 0.08, JACKET);
  const upperB = limb(0.08, 0.09, JACKET);
  const foreB = limb(0.07, 0.08, JACKET);
  const shoulderBallF = ball(0.12, JACKET);
  const shoulderBallB = ball(0.12, JACKET);
  const elbowBallF = ball(0.08, JACKET);
  const elbowBallB = ball(0.08, JACKET);
  const cuffF = limb(0.085, 0.085, JACKET_DARK);
  const cuffB = limb(0.085, 0.085, JACKET_DARK);
  const mittF = ball(0.1, DARK);
  const mittB = ball(0.1, DARK);
  group.add(
    upperF, foreF, upperB, foreB,
    shoulderBallF, shoulderBallB, elbowBallF, elbowBallB,
    cuffF, cuffB, mittF, mittB,
  );

  // Scratch vectors for the per-frame pose.
  const ankleF = new THREE.Vector3(0, 0.3, 0.44);
  const ankleB = new THREE.Vector3(0, 0.3, -0.44);
  const hipF = new THREE.Vector3();
  const hipB = new THREE.Vector3();
  const kneeF = new THREE.Vector3();
  const kneeB = new THREE.Vector3();
  const shoulderF = new THREE.Vector3();
  const shoulderB = new THREE.Vector3();
  const elbowF = new THREE.Vector3();
  const elbowB = new THREE.Vector3();
  const handF = new THREE.Vector3();
  const handB = new THREE.Vector3();
  const restF = new THREE.Vector3();
  const restB = new THREE.Vector3();
  const cuffA = new THREE.Vector3();

  /**
   * Pose the body. lean: signed roll the root is under (rad). intensity:
   * 0..1 carve compression. time: seconds, for idle micro-motion. rest:
   * 0..1, relaxes the pose once the finale stop settles.
   */
  function update({ lean, intensity, time, rest = 0 }) {
    const idle = Math.sin(time * 1.6) * 0.015;
    const hipY = 0.98 - 0.24 * intensity + idle;
    const hipShift = -0.15 * lean;

    hips.position.set(hipShift, hipY, 0);
    hips.rotation.z = -0.25 * lean;

    // Torso stays more upright than the board (counter-roll) and twists
    // slightly toward the nose.
    torsoG.position.set(hipShift * 1.4, hipY + 0.11, 0);
    torsoG.rotation.z = -0.4 * lean;
    torsoG.rotation.y = -0.35 - 0.15 * lean;

    // Riding, the face is turned down the fall line; at rest it straightens.
    head.rotation.y = -0.65 * (1 - rest);

    // Legs: ankles pinned, knees solved.
    hipF.set(hipShift, hipY, 0.17);
    hipB.set(hipShift, hipY, -0.17);
    solveJoint(kneeF, ankleF, hipF, LEG_SEG, LEG_SEG, KNEE_BEND);
    solveJoint(kneeB, ankleB, hipB, LEG_SEG, LEG_SEG, KNEE_BEND);
    setLimb(shinF, ankleF, kneeF);
    setLimb(thighF, kneeF, hipF);
    setLimb(shinB, ankleB, kneeB);
    setLimb(thighB, kneeB, hipB);
    kneeBallF.position.copy(kneeF);
    kneeBallB.position.copy(kneeB);

    // Arms swing for counterbalance: front arm reaches down the line, back
    // arm trails higher and wider as the carve deepens. At rest both hands
    // drop to hang loosely at the sides.
    const shY = hipY + 0.85;
    shoulderF.set(hipShift * 1.6, shY, 0.3);
    shoulderB.set(hipShift * 1.6, shY, -0.3);
    handF.set(0.42 - 0.25 * lean, shY - 0.3 - 0.12 * lean, 0.62);
    handB.set(0.22 - 0.28 * lean, shY - 0.12 + 0.2 * Math.abs(lean), -0.68);
    if (rest > 0) {
      restF.set(0.08, shY - 0.6, 0.4);
      restB.set(0.08, shY - 0.6, -0.4);
      handF.lerp(restF, rest);
      handB.lerp(restB, rest);
    }
    solveJoint(elbowF, shoulderF, handF, ARM_UPPER, ARM_FORE, ELBOW_BEND_F);
    solveJoint(elbowB, shoulderB, handB, ARM_UPPER, ARM_FORE, ELBOW_BEND_B);
    setLimb(upperF, shoulderF, elbowF);
    setLimb(foreF, elbowF, handF);
    setLimb(upperB, shoulderB, elbowB);
    setLimb(foreB, elbowB, handB);
    cuffA.lerpVectors(elbowF, handF, 0.72);
    setLimb(cuffF, cuffA, handF);
    cuffA.lerpVectors(elbowB, handB, 0.72);
    setLimb(cuffB, cuffA, handB);
    shoulderBallF.position.copy(shoulderF);
    shoulderBallB.position.copy(shoulderB);
    elbowBallF.position.copy(elbowF);
    elbowBallB.position.copy(elbowB);
    mittF.position.copy(handF);
    mittB.position.copy(handB);
  }

  update({ lean: 0, intensity: 0, time: 0 });
  return { group, update, bibAnchors, layoutBib };
}
