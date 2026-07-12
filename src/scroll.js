// Converts page scroll into a smoothed 0..1 timeline value.
//
// `target` is the raw scroll fraction; `value` eases toward it every frame
// with an exponential decay, which makes the scene feel fluid regardless of
// how the user scrolls (wheel steps, scrollbar drags, touch flicks).

export function createScrollTimeline({ smoothing = 6 } = {}) {
  let value = 0;

  function target() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  return {
    /** Advance the eased value by dt seconds and return it. */
    update(dt) {
      const t = target();
      value += (t - value) * (1 - Math.exp(-smoothing * dt));
      // Snap when close so the finale can rely on value reaching exactly 1.
      if (Math.abs(t - value) < 0.0005) value = t;
      return value;
    },
    get value() {
      return value;
    },
    get target() {
      return target();
    },
  };
}
