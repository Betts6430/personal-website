// Pins the DOM contact bib onto the rider's jacket with a projective
// transform. The four back-panel anchors are projected to screen space
// every frame; a 2D homography maps the card's corners exactly onto them,
// so the card foreshortens and sways with the torso plane like fabric
// pinned to the jacket instead of floating in front of it.

/** Adjugate of a 3x3 row-major matrix. */
function adjugate(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}

function multiply(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

/** Homography sending the projective basis to the four given points. */
function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const a = adjugate(m);
  const v = [
    a[0] * x4 + a[1] * y4 + a[2],
    a[3] * x4 + a[4] * y4 + a[5],
    a[6] * x4 + a[7] * y4 + a[8],
  ];
  return multiply(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

export function createBibPin(el) {
  return {
    /**
     * Warp the card so its corners land on the given screen-space points
     * (objects with x/y in px), ordered tl, tr, bl, br. The element must
     * have transform-origin 0 0 and sit at left/top 0.
     */
    update(tl, tr, bl, br) {
      const w = el.offsetWidth || 1;
      const h = el.offsetHeight || 1;
      const src = basisToPoints(0, 0, w, 0, 0, h, w, h);
      const dst = basisToPoints(tl.x, tl.y, tr.x, tr.y, bl.x, bl.y, br.x, br.y);
      const t = multiply(dst, adjugate(src));
      for (let i = 0; i < 9; i++) t[i] /= t[8];
      el.style.transform =
        `matrix3d(${t[0].toFixed(8)},${t[3].toFixed(8)},0,${t[6].toFixed(8)},` +
        `${t[1].toFixed(8)},${t[4].toFixed(8)},0,${t[7].toFixed(8)},` +
        `0,0,1,0,${t[2].toFixed(8)},${t[5].toFixed(8)},0,1)`;
    },
  };
}
