// Shared world definition for the caravan scene.
//
// A fixed, side-on camera watches an army march right-to-left along a road
// at sunrise, the city of Camelot standing on the far right. Like every
// scene on this site, every visual is a pure function of the eased scroll
// fraction p in [0, 1]; unlike the scrapped hall, the camera itself never
// moves (a site-wide rule now).
//
// The scene is set at sunrise and stays there: the sky and light shift only
// subtly across the scroll. The dramatic time-of-day change is deliberately
// held back (it belongs to the planned camp/timeline scene); here the
// scroll's real job is the procession marching past.
//
// Coordinate frame:
//   +X is screen-right, -X is screen-left; the procession travels toward -X.
//   +Y is up. The ground is the plane Y = 0 near the road.
//   -Z goes into the screen (away from the lens); the camera sits at +Z.

// --- Camera (fixed) ---------------------------------------------------------
// Eye height of someone standing at the roadside watching the column pass.
export const CAM = { x: 0, y: 2.6, z: 24 };
export const CAM_FOV = 45; // vertical degrees

// The camera is pitched up ~ FOV/6 from level so the horizon sits about a
// third of the way up the frame: land in the bottom third, sky in the top
// two thirds. (Look target height solved from that pitch at the road's
// depth; tuned against screenshots.)
export const CAM_LOOK = { x: 0, y: 5.8, z: 0 };

// --- The road ---------------------------------------------------------------
// The column walks along X at a constant depth, so from the side it reads as
// one flat lane crossing the frame. Set well back so the army sits near the
// horizon as a distant, compact crowd silhouetted against the sky. Width is
// in the depth (Z) direction.
export const ROAD_Z = -38;
export const ROAD_HALF_W = 4.5;
// Arthur rides the same road as the host (just a hair forward of centre so he
// reads a touch larger), leading out ahead of the mass by a clear gap in X. He
// is scaled up in makeArthur rather than pulled onto a separate nearer lane, so
// he no longer looks like he is marching a different path from the column.
export const ARTHUR_Z = -35;

// --- Camelot (fixed background city, right side) -----------------------------
// Far down-frame and offset to +X so the skyline renders in the right third,
// its base near the horizon and its spires rising into the middle third.
// Pushed well back so it reads as a whole city, not one castle; it never
// gets a camera push-in.
export const CAMELOT = { x: 60, y: 0, z: -185 };

// The sun sits low just left of the city (screen-right of center) and rises
// only slightly across the scroll; the scene is lit and warmed from there.
export const SUN_DIR = { x: 40, z: -300 }; // azimuth toward the low sun

// --- The procession ---------------------------------------------------------
// The column advances with the scroll: worldX(unit) = x0 - TRAVEL * p. So the
// whole march is a pure function of p (reverse scroll just rewinds it), and
// each flag-cart crosses a fixed screen threshold at a deterministic p.
export const TRAVEL = 240; // how far left the column shifts over the full scroll

// World X of the content trigger: a fixed line ~25% in from the right edge,
// at the army's depth. A flag-cart reaching it swaps the sky panel to that
// project. Tuned against screenshots so the flag sits about a quarter across
// when its card comes up.
export const X_TRIG = 23;

// The eased-p at which each project's flag-cart crosses X_TRIG, evenly spaced
// through the scroll (Arthur leads the stretch before the first). Each
// project's panel is up from its own cross until the next one's. The last
// crosses at 0.73 so its card can fade fully out (~0.85) before the scroll ends
// on the trailing signs, leaving no half-faded card at p = 1.
export const PROJECT_CROSS = [0.13, 0.25, 0.37, 0.49, 0.61, 0.73];

// Two waysign-carts trail the whole host and cross X_TRIG near the very end, so
// the march finishes on them: a "Home" sign back to the mountain and a
// "Timeline" sign to the timeline scene. They carry no project card; they are
// the diegetic navigation out of this scene.
export const SIGN_CROSS = [0.9, 0.96];

export function smoothstep(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Deterministic RNG so every load places the same terrain and column. */
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
export function groundNoise(x, z) {
  return (
    Math.sin(x * 0.031 + z * 0.021) * 0.55 +
    Math.sin(x * 0.011 - z * 0.037 + 1.3) * 0.3 +
    Math.sin(x * 0.07 + z * 0.05 + 2.1) * 0.15
  );
}

const GROUND_RELIEF = 2.6; // vertical scale of the rolling terrain

/**
 * Height of the ground at (x, z). The marching lane is held perfectly flat
 * (so nothing floats or clips); the land rolls more the farther it is, in
 * depth, from the road, giving the background its gentle hills.
 */
export function groundY(x, z) {
  const d = Math.abs(z - ROAD_Z);
  const roll = smoothstep((d - ROAD_HALF_W - 2) / 26); // 0 at road, 1 far off
  return groundNoise(x, z) * GROUND_RELIEF * roll;
}

// The sky gradient and its subtle scroll shift live in environment.js
// (createSky); world.js keeps only the geometry and layout math.
