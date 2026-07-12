import * as THREE from 'three';

// Shared world definition: the slope, the run, and the terrain height field.
// Everything that needs to agree on "where is the snow surface" imports this.

export const SLOPE = 0.22; // radians, ~12.6 degrees
export const RUN_START_Z = -200; // top of the run
export const RUN_END_Z = 6; // just in front of the camera
export const CARVES = 6; // number of half-turns over the full descent
export const CARVE_AMP = 26; // lateral reach of each carve, world units

export const FINALE_START = 0.86; // timeline p where the stop sequence begins
export const STOP_Z = 10; // where the rider comes to rest

export function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Height of the (smooth) slope surface at a given world z. */
export function hillY(z) {
  return -Math.tan(SLOPE) * z;
}

/**
 * The rider's descent path and pose parameters for timeline p in [0, 1].
 * Shared by the rider, the carve trail, and the spray emitter so they can
 * never disagree about where the board is.
 *
 * lean: roll into the turn (rotation.z; positive tilts toward -X, which is
 * the inside of the turn while the path curves that way).
 * intensity: 0 between turns, 1 at a carve apex.
 * outSign: which side (+/-X) snow sprays toward, i.e. the outside of the turn.
 */
export function pathAt(p) {
  const z = RUN_START_Z + (RUN_END_Z - RUN_START_Z) * p;
  const phase = p * CARVES * Math.PI;
  const sinP = Math.sin(phase);
  // Carve reach tapers on the approach so the rider stays inside the
  // camera frustum near the lens (and turns naturally tighten at the end).
  const amp = CARVE_AMP * (1 - 0.85 * p);
  const x = amp * sinP;

  const dampdp = -0.85 * CARVE_AMP;
  const dxdp = dampdp * sinP + amp * CARVES * Math.PI * Math.cos(phase);
  const dzdp = RUN_END_Z - RUN_START_Z;
  const yaw = Math.atan2(dxdp, dzdp);

  return {
    x,
    z,
    y: hillY(z),
    yaw,
    lean: 0.55 * sinP,
    intensity: Math.abs(sinP),
    outSign: Math.sign(sinP),
    phase,
  };
}

const FINALE_BASE = pathAt(FINALE_START);

/**
 * Full run pose including the finale. Before FINALE_START this is pathAt;
 * after it the rider keeps carving: the last sine arc swings wide and
 * sweeps back to the centerline exactly at p = 1 (the carve phase hits
 * 6 pi there), so the hockey stop is the natural end of a swooping turn
 * rather than a straight run-in. Only z is remapped (deceleration into
 * STOP_Z), the yaw whips sideways late in the sweep, and settle damps the
 * last of the lateral drift so he is dead still once the bib is up.
 *
 * Extra fields: skid (0..1 pulse during the stop, drives the spray burst
 * and deep knee compression) and ft (0..1 progress through the finale,
 * used by the camera push-in and the contact bib fade).
 */
export function poseAt(p) {
  if (p <= FINALE_START) return { ...pathAt(p), skid: 0, ft: 0 };

  const t = (p - FINALE_START) / (1 - FINALE_START);
  const pl = pathAt(p);

  const whip = smoothstep((t - 0.7) / 0.25);
  const skid = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.68) / 0.3)));
  const settle = smoothstep((t - 0.85) / 0.15);

  const z = FINALE_BASE.z + (STOP_Z - FINALE_BASE.z) * (1 - Math.pow(1 - t, 1.8));
  const x = pl.x * (1 - settle);
  const yaw = pl.yaw * (1 - whip) + whip * (Math.PI / 2);
  const lean = pl.lean * (1 - whip) - 0.42 * skid;
  const intensity = pl.intensity * (1 - whip) + 0.85 * skid + 0.15 * settle;

  return {
    x,
    z,
    y: hillY(z),
    yaw,
    lean,
    intensity: Math.min(1, intensity),
    outSign: pl.outSign,
    phase: pl.phase,
    skid,
    ft: t,
  };
}

/** Deterministic RNG so tree placement is identical every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap smooth 2D noise (summed sines), roughly in [-1, 1]. */
export function terrainNoise(x, z) {
  return (
    Math.sin(x * 0.061 + z * 0.043) * 0.55 +
    Math.sin(x * 0.017 - z * 0.089 + 1.7) * 0.3 +
    Math.sin(x * 0.14 + z * 0.021 + 4.2) * 0.15
  );
}

/**
 * 0 inside the riding corridor, easing to 1 on the flanks. Keeps the run
 * itself perfectly smooth so the rider never floats or clips.
 */
export function corridorFalloff(x) {
  const ax = Math.abs(x);
  const t = Math.min(1, Math.max(0, (ax - 22) / 38));
  return t * t * (3 - 2 * t);
}

const BUMP_HEIGHT = 2.0;

/** Terrain displacement in the hill's local (pre-tilt) frame. */
export function terrainBump(x, zLocal) {
  return terrainNoise(x, zLocal) * BUMP_HEIGHT * corridorFalloff(x);
}

/** World-space height of the actual (bumpy) snow surface at (x, z). */
export function surfaceY(x, zWorld) {
  const zLocal = zWorld / Math.cos(SLOPE);
  return hillY(zWorld) + terrainBump(x, zLocal) * Math.cos(SLOPE);
}
