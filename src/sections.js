// Fades content panels in and out based on the scroll timeline. Each panel
// declares its slice of the descent with data-start/data-end; opacity ramps
// over a small progress window at both edges, with a matching slide so
// panels drift up as they appear. Driven every frame from main.js so the
// panels move with the same eased value as the rider.

const FADE = 0.04; // progress units over which a panel fades in/out

export function createSections() {
  const items = [...document.querySelectorAll('#sections .panel')].map((el) => ({
    el,
    start: Number(el.dataset.start),
    end: Number(el.dataset.end),
  }));

  function update(p) {
    for (const it of items) {
      const o = Math.max(
        0,
        Math.min(1, (p - it.start) / FADE, (it.end - p) / FADE),
      );
      const eased = o * o * (3 - 2 * o);
      it.el.style.opacity = eased.toFixed(3);
      it.el.style.setProperty('--slide', `${((1 - eased) * 26).toFixed(1)}px`);
      it.el.style.visibility = eased === 0 ? 'hidden' : 'visible';
      it.el.style.pointerEvents = eased > 0.5 ? 'auto' : 'none';
    }
  }

  return { update };
}
