import * as THREE from 'three';

// The snowboarder: stylized low-poly, built from primitives, posed
// procedurally every frame. Regular stance, chest facing local +X, riding
// toward local +Z. The root group's yaw/pitch/roll are set by main.js from
// the path; update() poses the body inside that leaned frame.
//
// Legs use analytic 2-bone IK: ankles are pinned to the boots, the hips
// drop with carve compression, and the knee point is solved so thigh and
// shin always connect exactly. Limbs are unit cylinders stretched between
// joint points.

const JACKET = 0x5ea3cd;
const JACKET_DARK = 0x2e6f9e;
const PANTS = 0x3f6480;
const DARK = 0x1d3547;
const HELMET = 0x24313a;
const GOGGLE = 0x9fd0e8;

const LEG_SEG = 0.4; // thigh and shin length
const UP = new THREE.Vector3(0, 1, 0);

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true });
}

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  return m;
}

/** Unit-length cylinder with its base at the origin, pointing up +Y. */
function limb(rTop, rBottom, color) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, 1, 6);
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

const _mid = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _bend = new THREE.Vector3();

/** Knee position for a 2-bone leg from ankle a to hip h, bending chestward. */
function solveKnee(out, a, h) {
  _axis.subVectors(h, a);
  const d = Math.min(_axis.length(), LEG_SEG * 2 * 0.999);
  _axis.normalize();
  _mid.addVectors(a, h).multiplyScalar(0.5);
  // Bend direction: chest side (+X), made perpendicular to the leg axis.
  _bend.set(1, 0, 0).addScaledVector(_axis, -_axis.x).normalize();
  const bulge = Math.sqrt(Math.max(LEG_SEG * LEG_SEG - (d / 2) * (d / 2), 0.0004));
  out.copy(_mid).addScaledVector(_bend, bulge);
  return out;
}

export function createRider() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  // --- Board ---
  const deck = box(0.46, 0.07, 1.9, JACKET_DARK);
  deck.position.y = 0.055;
  group.add(deck);
  for (const end of [-1, 1]) {
    const tip = box(0.4, 0.055, 0.32, JACKET_DARK);
    tip.position.set(0, 0.1, end * 1.02);
    tip.rotation.x = -end * 0.45;
    group.add(tip);
  }

  // --- Boots + bindings (ankle anchors) ---
  const boots = [];
  for (const [zPos, yawBoot] of [
    [0.44, 0.5],
    [-0.44, 0.2],
  ]) {
    const binding = box(0.34, 0.1, 0.3, DARK);
    binding.position.set(0, 0.13, zPos);
    group.add(binding);
    const boot = box(0.24, 0.3, 0.4, DARK);
    boot.position.set(0, 0.3, zPos);
    boot.rotation.y = yawBoot;
    group.add(boot);
    boots.push(boot);
  }

  // --- Legs ---
  const shinF = limb(0.1, 0.12, PANTS);
  const thighF = limb(0.13, 0.11, PANTS);
  const shinB = limb(0.1, 0.12, PANTS);
  const thighB = limb(0.13, 0.11, PANTS);
  group.add(shinF, thighF, shinB, thighB);

  // --- Hips ---
  const hips = box(0.36, 0.26, 0.52, PANTS);
  group.add(hips);

  // --- Torso (jacket) with the clean back panel for the finale card ---
  const torsoG = new THREE.Group();
  const torso = box(0.46, 0.85, 0.6, JACKET);
  torso.position.y = 0.44;
  torsoG.add(torso);
  const backPanel = box(0.03, 0.58, 0.46, JACKET_DARK);
  backPanel.position.set(-0.245, 0.44, 0);
  torsoG.add(backPanel);

  // --- Head: helmet + goggles, face turned down the fall line ---
  const head = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 6), mat(HELMET));
  helmet.castShadow = true;
  head.add(helmet);
  const goggles = box(0.08, 0.13, 0.32, GOGGLE);
  goggles.position.set(0.17, 0.03, 0);
  head.add(goggles);
  head.position.y = 1.08;
  head.rotation.y = -0.65;
  torsoG.add(head);
  group.add(torsoG);

  // Invisible anchors just off the back panel surface; main.js projects
  // them to screen space to pin the contact bib onto the jacket.
  const anchorTop = new THREE.Object3D();
  anchorTop.position.set(-0.3, 0.73, 0);
  torsoG.add(anchorTop);
  const anchorBottom = new THREE.Object3D();
  anchorBottom.position.set(-0.3, 0.15, 0);
  torsoG.add(anchorBottom);

  // --- Arms + mitts, restretched every frame for balance swing ---
  const armF = limb(0.085, 0.075, JACKET);
  const armB = limb(0.085, 0.075, JACKET);
  const mittF = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(DARK));
  const mittB = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(DARK));
  mittF.castShadow = mittB.castShadow = true;
  group.add(armF, armB, mittF, mittB);

  // Scratch vectors for the per-frame pose.
  const ankleF = new THREE.Vector3(0, 0.3, 0.44);
  const ankleB = new THREE.Vector3(0, 0.3, -0.44);
  const hipF = new THREE.Vector3();
  const hipB = new THREE.Vector3();
  const kneeF = new THREE.Vector3();
  const kneeB = new THREE.Vector3();
  const shoulderF = new THREE.Vector3();
  const shoulderB = new THREE.Vector3();
  const handF = new THREE.Vector3();
  const handB = new THREE.Vector3();

  /**
   * Pose the body. lean: signed roll the root is under (rad). intensity:
   * 0..1 carve compression. time: seconds, for idle micro-motion.
   */
  function update({ lean, intensity, time }) {
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

    // Legs: ankles pinned, knees solved.
    hipF.set(hipShift, hipY, 0.17);
    hipB.set(hipShift, hipY, -0.17);
    solveKnee(kneeF, ankleF, hipF);
    solveKnee(kneeB, ankleB, hipB);
    setLimb(shinF, ankleF, kneeF);
    setLimb(thighF, kneeF, hipF);
    setLimb(shinB, ankleB, kneeB);
    setLimb(thighB, kneeB, hipB);

    // Arms swing for counterbalance: front arm reaches down the line,
    // back arm trails higher and wider as the carve deepens.
    const shY = hipY + 0.85;
    shoulderF.set(hipShift * 1.6, shY, 0.28);
    shoulderB.set(hipShift * 1.6, shY, -0.28);
    handF.set(0.42 - 0.25 * lean, shY - 0.3 - 0.12 * lean, 0.62);
    handB.set(0.22 - 0.28 * lean, shY - 0.12 + 0.2 * Math.abs(lean), -0.68);
    setLimb(armF, shoulderF, handF);
    setLimb(armB, shoulderB, handB);
    mittF.position.copy(handF);
    mittB.position.copy(handB);
  }

  update({ lean: 0, intensity: 0, time: 0 });
  return { group, update, anchorTop, anchorBottom };
}
