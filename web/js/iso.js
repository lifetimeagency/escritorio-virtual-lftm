// Isometric projection and drawing primitives. World units are tiles (x, y) and pixels (z).
export const TW = 64;
export const TH = 32;
const EDGE = 'rgba(38, 50, 72, 0.22)';

export function iso(x, y, z = 0) {
  return [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

export function poly(ctx, pts, fill, stroke = EDGE) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// Solid box with its three visible faces (top, +y face on the left, +x face on the right).
export function box(ctx, x, y, z, w, d, h, color, o = {}) {
  const stroke = o.stroke === undefined ? EDGE : o.stroke;
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
  const left = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)];
  const right = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)];
  poly(ctx, left, o.left || shade(color, 0.9), stroke);
  poly(ctx, right, o.right || shade(color, 0.8), stroke);
  poly(ctx, top, o.top || color, stroke);
}

// Flat quad on the floor (or at height z).
export function quad(ctx, x, y, w, d, fill, stroke = null, z = 0) {
  poly(ctx, [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)], fill, stroke);
}

// Vertical quad on a plane of constant y (faces +y) or constant x (faces +x).
export function wallY(ctx, x0, x1, y, z0, z1, fill, stroke = null) {
  poly(ctx, [iso(x0, y, z1), iso(x1, y, z1), iso(x1, y, z0), iso(x0, y, z0)], fill, stroke);
}
export function wallX(ctx, x, y0, y1, z0, z1, fill, stroke = null) {
  poly(ctx, [iso(x, y0, z1), iso(x, y1, z1), iso(x, y1, z0), iso(x, y0, z0)], fill, stroke);
}

export function inPoly(pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
