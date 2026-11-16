// The office: layout, furniture and people. render() draws one frame and returns the clickable regions.
import { iso, box, quad, wallX, wallY, poly, shade } from './iso.js';
import { drawAvatar } from './avatars.js';

export const W = 38, D = 22, ROOM_D = 6;
const MEZ_W = 14, MZ = 64;                  // the bosses' rooms sit on a mezzanine, one floor up
const WALL_LOW = 96, WALL_HIGH = MZ + 96;
const LAZER_X = 31.5;                       // leisure and sports strip on the right
const COURT = { x: 32.4, y: 8.4, w: 5, l: 11 };
const PITCH = 1.6, HEAD_ZONE = 1.4, TABLE_L = HEAD_ZONE + 3 * PITCH, TABLE_D = 2.2;

export const BOSS = { x: 3.5, y: 1.8, z: MZ };
export const COS = { x: 10.5, y: 1.8, z: MZ };
export const TABLES = [
  { id: 1, tx: 2, ty: 10 }, { id: 2, tx: 12, ty: 10 }, { id: 3, tx: 22, ty: 10 },
  { id: 4, tx: 2, ty: 17 }, { id: 5, tx: 12, ty: 17 }, { id: 6, tx: 22, ty: 17 },
];

// Lifetime brand palette (Manual de Identidade): greens lead, navy/slate/silver and white support.
const B = { g900: '#0C4546', g700: '#006864', g500: '#118282', navy: '#002740', slate: '#283943', silver: '#C2C3C9' };
const C = {
  wall: '#fbfbfc', wallDim: '#eff0f2', cap: '#ffffff',
  floor: '#e3e5e9', plank: 'rgba(40, 57, 67, 0.06)',
  boss: '#d6e3e2', bossRug: B.g900, cos: '#dfe3e7', cosRug: B.slate,
  copaA: '#f9fafb', copaB: '#e6e8ec', lazer: '#d2e5e3', lazerRug: '#9cc9c6',
  desk: '#fcfdfe', metal: B.silver, wood: B.slate, chair: '#eef0f3', chairBase: '#8d949c',
  white: '#ffffff', screenOff: B.slate, glass: 'rgba(17, 130, 130, 0.13)', sky: '#d7e9e8',
  ink: B.g900, accent: B.g500, bad: '#c0453f',
};
const EDGE = 'rgba(38,50,72,0.12)';
export const assets = { logo: new Image() };
assets.logo.src = new URL('../img/logo-white.png', import.meta.url).href;
const LOGO_RATIO = 170 / 753;
const HOT_FILL = 'rgba(17, 130, 130, 0.12)', HOT_LINE = 'rgba(0, 104, 100, 0.85)';
const SHADOW = 'rgba(12, 40, 45, 0.09)';
const FONT = 'urbane, Montserrat, system-ui, sans-serif';

const seatX = (tb, k) => tb.tx + 1 + HEAD_ZONE + (k - 0.5) * PITCH; // k = 1..3 along the table
export function seatPos(areaId, seat) {
  const t = TABLES[areaId - 1];
  if (seat === 0) return { x: t.tx + 0.5, y: t.ty + TABLE_D / 2, facing: 'SE' };
  if (seat <= 3) return { x: seatX(t, seat), y: t.ty - 0.5, facing: 'SW' };
  return { x: seatX(t, seat - 3), y: t.ty + TABLE_D + 0.5, facing: 'NE' };
}

export function bounds() {
  return { minX: -D * 32 - 20, maxX: W * 32 + 20, minY: -WALL_HIGH - 44, maxY: (W + D) * 16 + 20 };
}

// ---------------------------------------------------------------- furniture
function chairBase(ctx, cx, cy) {
  box(ctx, cx - 0.22, cy - 0.22, 0, 0.44, 0.44, 2, C.chairBase, { stroke: null });
  box(ctx, cx - 0.05, cy - 0.05, 2, 0.1, 0.1, 10, C.metal, { stroke: null });
  box(ctx, cx - 0.3, cy - 0.3, 12, 0.6, 0.6, 4, C.chair);
}
function chairBack(ctx, cx, cy, facing) {
  if (facing === 'SW') box(ctx, cx - 0.28, cy - 0.38, 15, 0.56, 0.08, 22, C.chair);
  else if (facing === 'NE') box(ctx, cx - 0.28, cy + 0.3, 15, 0.56, 0.08, 22, C.chair);
  else if (facing === 'SE') box(ctx, cx - 0.38, cy - 0.28, 15, 0.08, 0.56, 22, C.chair);
  else box(ctx, cx + 0.3, cy - 0.28, 15, 0.08, 0.56, 22, C.chair);
}
function seat(ctx, cx, cy, facing, avatarKey) {
  chairBase(ctx, cx, cy);
  const front = facing === 'SW' || facing === 'SE';
  if (front) chairBack(ctx, cx, cy, facing);
  if (avatarKey !== null && avatarKey !== undefined) {
    const [sx, sy] = iso(cx, cy, 14);
    drawAvatar(ctx, avatarKey, facing, sx, sy);
  }
  if (!front) chairBack(ctx, cx, cy, facing);
}

// Four white monitors in a curved array around the user. f is the direction the screens face
// ([0, 1] = towards +y); the outer screens bend towards that side.
function monitors(ctx, mx, my, z, f, lit, t) {
  const lat = [Math.abs(f[1]), Math.abs(f[0])];
  const pts = [[-0.66, 0.28], [-0.34, 0.08], [0, 0], [0.34, 0.08], [0.66, 0.28]]
    .map(([a, b]) => [mx + lat[0] * a + f[0] * b, my + lat[1] * a + f[1] * b]);
  const showScreens = f[0] + f[1] > 0; // screens that face the camera; otherwise we see the white backs
  const z0 = z + 6, z1 = z0 + 19;
  const stand = () => {
    const bx = mx - f[0] * 0.08, by = my - f[1] * 0.08;
    box(ctx, bx - 0.15, by - 0.15, z, 0.3, 0.3, 1.5, C.metal, { stroke: null });
    box(ctx, bx - 0.04, by - 0.04, z, 0.08, 0.08, 15, C.metal, { stroke: null });
  };
  const at = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const face = (a, b, za, zb, fill, stroke = null) => poly(ctx, [iso(a[0], a[1], zb), iso(b[0], b[1], zb), iso(b[0], b[1], za), iso(a[0], a[1], za)], fill, stroke);
  if (showScreens) stand();
  const order = [0, 1, 2, 3].sort((i, j) => (pts[i][0] + pts[i][1] + pts[i + 1][0] + pts[i + 1][1]) - (pts[j][0] + pts[j][1] + pts[j + 1][0] + pts[j + 1][1]));
  for (const i of order) {
    const a = at(pts[i], pts[i + 1], 0.03), b = at(pts[i], pts[i + 1], 0.97);
    face(a, b, z0, z1, C.white, 'rgba(38, 50, 72, 0.28)');
    if (showScreens) {
      const on = lit ? ['#9fd6d3', '#c7ebe9', '#b3e1de'][(Math.floor(t / 420) + i) % 3] : C.screenOff;
      face(at(a, b, 0.08), at(a, b, 0.92), z0 + 1.8, z1 - 1.8, on);
      if (lit) for (let r = 0; r < 3; r++) face(at(a, b, 0.18), at(a, b, 0.45 + ((r * 7 + i * 3) % 5) * 0.08), z0 + 4.5 + r * 4, z0 + 5.8 + r * 4, 'rgba(255,255,255,0.8)');
    } else {
      face(at(a, b, 0.4), at(a, b, 0.6), z0 + 8, z0 + 11, '#dfe3e8');
    }
  }
  if (!showScreens) stand();
}

function keyboard(ctx, x, y, z, axis) {
  if (axis === 'x') { box(ctx, x - 0.2, y - 0.07, z, 0.4, 0.14, 1.2, '#f1f3f6'); box(ctx, x + 0.27, y - 0.04, z, 0.07, 0.1, 1.2, '#f1f3f6'); }
  else { box(ctx, x - 0.07, y - 0.2, z, 0.14, 0.4, 1.2, '#f1f3f6'); box(ctx, x - 0.04, y + 0.27, z, 0.1, 0.07, 1.2, '#f1f3f6'); }
}

function teamTable(ctx, tb, working, bySeat, t) {
  const x0 = tb.tx + 1, y0 = tb.ty, z = 20;
  for (const lx of [x0 + 0.05, x0 + TABLE_L - 0.17]) for (const ly of [y0 + 0.05, y0 + TABLE_D - 0.17]) box(ctx, lx, ly, 0, 0.12, 0.12, z, C.metal, { stroke: null });
  box(ctx, x0 + 0.3, y0 + TABLE_D / 2 - 0.06, 9, TABLE_L - 0.6, 0.12, 11, '#e4e8ed', { stroke: null });
  box(ctx, x0, y0, z, TABLE_L, TABLE_D, 3, C.desk);
  const lit = (s) => bySeat[s] && working.has(bySeat[s].id);
  keyboard(ctx, x0 + 0.22, y0 + TABLE_D / 2, z + 3, 'y');
  monitors(ctx, x0 + 0.78, y0 + TABLE_D / 2, z + 3, [-1, 0], lit(0), t);
  for (let k = 1; k <= 3; k++) { keyboard(ctx, seatX(tb, k), y0 + 0.22, z + 3, 'x'); monitors(ctx, seatX(tb, k), y0 + 0.8, z + 3, [0, -1], lit(k), t); }
  for (let k = 1; k <= 3; k++) { monitors(ctx, seatX(tb, k), y0 + TABLE_D - 0.8, z + 3, [0, 1], lit(k + 3), t); keyboard(ctx, seatX(tb, k), y0 + TABLE_D - 0.22, z + 3, 'x'); }
}

function execDesk(ctx, x0, y0, panel, lit, t, papers) {
  box(ctx, x0, y0, 0, 0.1, 1.1, 20, C.desk);
  box(ctx, x0 + 2.7, y0, 0, 0.1, 1.1, 20, C.desk);
  box(ctx, x0 + 0.1, y0 + 0.96, 3, 2.6, 0.06, 17, panel);
  box(ctx, x0 - 0.05, y0 - 0.05, 20, 2.9, 1.2, 3, C.desk);
  keyboard(ctx, x0 + 1.4, y0 + 0.2, 23, 'x');
  monitors(ctx, x0 + 1.4, y0 + 0.78, 23, [0, -1], lit, t);
  if (papers !== undefined) {
    box(ctx, x0 + 0.12, y0 + 0.3, 23, 0.46, 0.56, 1.5, '#aab3c0');
    if (papers > 0) box(ctx, x0 + 0.15, y0 + 0.33, 24.5, 0.4, 0.5, Math.min(papers, 8) * 2, C.white);
  }
}

// Wall screen at the end of each table: live mini chart of the area's tasks; opens the dashboard.
function dashScreen(ctx, tb, levels) {
  const x = tb.tx + 8.0, y0 = tb.ty + 0.25, y1 = tb.ty + TABLE_D - 0.25, mid = tb.ty + TABLE_D / 2;
  box(ctx, x - 0.2, mid - 0.3, 0, 0.4, 0.6, 2, C.chairBase, { stroke: null });
  box(ctx, x - 0.05, mid - 0.05, 2, 0.1, 0.1, 30, C.metal, { stroke: null });
  box(ctx, x - 0.04, y0, 28, 0.08, y1 - y0, 36, C.white);
  wallX(ctx, x + 0.045, y0 + 0.06, y1 - 0.06, 30, 62, B.g900);
  wallX(ctx, x + 0.05, y1 - 0.75, y1 - 0.16, 56, 58, 'rgba(255,255,255,0.85)');
  const step = (y1 - y0 - 0.32) / levels.length;
  levels.forEach((v, i) => { // reads left to right on screen, which is from y1 towards y0
    const ya = y1 - 0.16 - (i + 1) * step + 0.05, yb = y1 - 0.16 - i * step - 0.05;
    wallX(ctx, x + 0.05, ya, yb, 34, 36 + v * 16, i === 2 ? '#ffffff' : '#7fc0bd');
  });
}

function plant(ctx, x, y, s = 1) {
  box(ctx, x - 0.2, y - 0.2, 0, 0.4, 0.4, 13, '#f4f5f6');
  const [sx, sy] = iso(x, y, 13);
  const leaves = [[0, -8, 11, B.g900], [-9, -15, 9, B.g700], [9, -16, 9, B.g700], [0, -24, 10, B.g500], [-5, -32, 7, B.g700], [6, -33, 6, '#3fa3a0']];
  for (const [dx, dy, r, col] of leaves) { ctx.beginPath(); ctx.ellipse(sx + dx * s, sy + dy * s, r * s, r * s * 0.9, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
}

function stool(ctx, x, y) {
  box(ctx, x - 0.04, y - 0.04, 0, 0.08, 0.08, 16, C.metal, { stroke: null });
  box(ctx, x - 0.2, y - 0.2, 16, 0.4, 0.4, 3, C.wood);
}

function beanbag(ctx, x, y, color) {
  const [sx, sy] = iso(x, y, 0);
  ctx.beginPath(); ctx.ellipse(sx, sy - 9, 19, 13, 0, 0, Math.PI * 2); ctx.fillStyle = shade(color, 0.85); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - 1, sy - 13, 15, 9, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

function glassY(ctx, i, y, h = 60) { // partition along x at constant y
  wallY(ctx, i, i + 1, y, 0, h, C.glass);
  wallY(ctx, i, i + 1, y, h - 2, h, '#f4f6f9', 'rgba(38,50,72,0.15)');
  wallY(ctx, i, i + 1, y, 0, 2, '#dfe4ea');
}
function glassX(ctx, x, j, h = 60) {
  wallX(ctx, x, j, j + 1, 0, h, C.glass);
  wallX(ctx, x, j, j + 1, h - 2, h, '#e9edf2', 'rgba(38,50,72,0.15)');
  wallX(ctx, x, j, j + 1, 0, 2, '#d5dbe3');
}
function post(ctx, x, y, h = 60) { box(ctx, x - 0.04, y - 0.04, 0, 0.08, 0.08, h, '#e9edf2', { stroke: EDGE }); }

// The white logo on dark brand surfaces, projected onto a wall. w is in tiles.
function logoWith(ctx, a, b, c, d, origin, wPx, hPx) {
  const img = assets.logo;
  if (!img.complete || !img.naturalWidth) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.transform(a, b, c, d, origin[0], origin[1]);
  ctx.drawImage(img, 0, 0, wPx, hPx);
  ctx.restore();
}
function logoOnWallY(ctx, x0, y, w, zTop) { // wall facing +y, reads along +x
  logoWith(ctx, 32, 16, 0, 1, iso(x0, y, zTop), w, w * 36 * LOGO_RATIO);
}
function logoOnWallX(ctx, x, yStart, w, zTop) { // wall facing +x, reads from yStart towards smaller y
  logoWith(ctx, 32, -16, 0, 1, iso(x, yStart, zTop), w, w * 36 * LOGO_RATIO);
}

// ---------------------------------------------------------------- padel court
function line(ctx, a, b, color, width = 1.5) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
function courtFloor(ctx) {
  const { x, y, w, l } = COURT, mid = y + l / 2, service = 0.7 * (l / 2), white = 'rgba(255,255,255,0.92)';
  quad(ctx, x - 0.5, y - 0.5, w + 1, l + 1, B.g700);
  quad(ctx, x, y, w, l, B.g500, white);
  for (const sy of [mid - service, mid + service]) line(ctx, iso(x, sy), iso(x + w, sy), white);
  line(ctx, iso(x + w / 2, mid - service), iso(x + w / 2, mid + service), white);
}
const courtWallH = (rel) => (rel < 2 || rel >= COURT.l - 2 ? 46 : 30); // glass is taller near the back walls
function courtGlass(ctx, near) {
  const { x, y, w, l } = COURT, glass = 'rgba(255,255,255,0.14)', frame = 'rgba(40, 57, 67, 0.45)';
  const postAt = (px, py, h) => line(ctx, iso(px, py), iso(px, py, h), frame, 1.4);
  const sideX = near ? x + w : x, endY = near ? y + l : y;
  if (!near) { // the far side is drawn first, then the net
    for (let i = 0; i < w; i++) { wallY(ctx, x + i, x + i + 1, endY, 0, 46, glass, frame); wallY(ctx, x + i, x + i + 1, endY, 46, 58, 'rgba(40,57,67,0.07)', frame); }
  }
  for (let j = 0; j < l; j++) { const h = courtWallH(j); wallX(ctx, sideX, y + j, y + j + 1, 0, h, glass, frame); postAt(sideX, y + j, Math.max(h, courtWallH(j - 1))); }
  postAt(sideX, y + l, 46);
  if (near) {
    for (let i = 0; i < w; i++) { wallY(ctx, x + i, x + i + 1, endY, 0, 46, glass, frame); wallY(ctx, x + i, x + i + 1, endY, 46, 58, 'rgba(40,57,67,0.07)', frame); }
  } else {
    const mid = y + l / 2;
    wallY(ctx, x, x + w, mid, 0, 11, 'rgba(255,255,255,0.45)', 'rgba(40,57,67,0.35)');
    wallY(ctx, x, x + w, mid, 10, 12, '#ffffff');
    box(ctx, x - 0.05, mid - 0.05, 0, 0.1, 0.1, 13, B.slate, { stroke: null }); box(ctx, x + w - 0.05, mid - 0.05, 0, 0.1, 0.1, 13, B.slate, { stroke: null });
  }
}

// ---------------------------------------------------------------- static shell
function shell(ctx) {
  // back walls, taller where the mezzanine is
  wallX(ctx, 0, 0, ROOM_D, 0, WALL_HIGH, C.wallDim, EDGE); wallX(ctx, 0, ROOM_D, D, 0, WALL_LOW, C.wallDim, EDGE);
  wallY(ctx, 0, MEZ_W, 0, 0, WALL_HIGH, C.wall, EDGE); wallY(ctx, MEZ_W, W, 0, 0, WALL_LOW, C.wall, EDGE);
  quad(ctx, -0.2, -0.2, MEZ_W + 0.2, 0.2, C.cap, EDGE, WALL_HIGH); quad(ctx, MEZ_W, -0.2, W - MEZ_W, 0.2, C.cap, EDGE, WALL_LOW);
  quad(ctx, -0.2, 0, 0.2, ROOM_D, C.cap, EDGE, WALL_HIGH); quad(ctx, -0.2, ROOM_D, 0.2, D - ROOM_D, C.cap, EDGE, WALL_LOW);
  wallX(ctx, MEZ_W, -0.2, 0, WALL_LOW, WALL_HIGH, shade(C.wallDim, 0.95), EDGE); wallY(ctx, -0.2, 0, ROOM_D, WALL_LOW, WALL_HIGH, C.wall, EDGE);
  wallX(ctx, W, -0.2, 0, 0, WALL_LOW, shade(C.wallDim, 0.95), EDGE); wallY(ctx, -0.2, 0, D, 0, WALL_LOW, C.wall, EDGE);
  wallX(ctx, 0, ROOM_D, D, 0, 4, '#dfe3e9'); wallY(ctx, MEZ_W, W, 0, 0, 4, '#e6e9ee');

  // floors
  quad(ctx, 0, 0, W, D, C.floor);
  for (let x = MEZ_W; x < 21; x++) for (let y = 0; y < ROOM_D; y++) quad(ctx, x, y, 1, 1, (x + y) % 2 ? C.copaA : C.copaB);
  quad(ctx, 21, 0, W - 21, ROOM_D, C.lazer); quad(ctx, LAZER_X, ROOM_D, W - LAZER_X, D - ROOM_D, C.lazer);
  ctx.strokeStyle = C.plank; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = ROOM_D + 0.5; y < D; y += 0.5) { const a = iso(0, y), b = iso(LAZER_X, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  poly(ctx, [iso(0, 0), iso(W, 0), iso(W, D), iso(0, D)], null, 'rgba(38,50,72,0.25)');

  quad(ctx, 21.5, 1.3, 3.6, 1.5, C.lazerRug);
  quad(ctx, 26.15, 3.55, 2.6, 1.4, SHADOW);
  for (const tb of TABLES) quad(ctx, tb.tx + 1.15, tb.ty + 0.2, TABLE_L, TABLE_D, SHADOW);
  courtFloor(ctx);

  // left wall: windows and the brand panel; back wall: windows over copa and lounge
  for (const y0 of [7.3, 17.6]) {
    wallX(ctx, 0.01, y0, y0 + 3.2, 30, 82, C.sky, 'rgba(255,255,255,0.9)');
    wallX(ctx, 0.01, y0 + 1.58, y0 + 1.62, 30, 82, '#ffffff');
    wallX(ctx, 0.01, y0, y0 + 3.2, 28, 30, '#ffffff', EDGE);
  }
  wallX(ctx, 0.01, 11.6, 16.5, 14, 90, B.g900);
  logoOnWallX(ctx, 0.02, 16.05, 4.0, 69);
  for (const [a, b] of [[15.0, 17.6], [22.2, 27.8], [32.4, 37.0]]) {
    wallY(ctx, a, b, 0.01, 44, 84, C.sky, 'rgba(255,255,255,0.9)');
    wallY(ctx, (a + b) / 2 - 0.02, (a + b) / 2 + 0.02, 0.01, 44, 84, '#ffffff');
  }
}

// ---------------------------------------------------------------- frame helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function pill(ctx, x, y, text, s, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.font = `600 11px ${FONT}`;
  const w = ctx.measureText(text).width + 18, h = 20;
  ctx.shadowColor = 'rgba(20, 30, 60, 0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10); ctx.fillStyle = o.bg || 'rgba(255,255,255,0.96)'; ctx.fill();
  ctx.shadowColor = 'transparent';
  if (o.dashed) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#9aa5b6'; ctx.stroke(); }
  ctx.fillStyle = o.fg || C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 1);
  ctx.restore();
}

function badge(ctx, x, y, n, color, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 0, 1); ctx.restore();
}

function bubble(ctx, x, y, t, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.shadowColor = 'rgba(20, 30, 60, 0.2)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
  roundRect(ctx, -13, -9, 26, 16, 8); ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent';
  for (let i = 0; i < 3; i++) {
    const up = Math.sin(t / 160 - i * 0.9) > 0.5 ? -2 : 0;
    ctx.beginPath(); ctx.arc(-6 + i * 6, -1 + up, 2, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
  }
  ctx.restore();
}

function plus(ctx, x, y, s, hot) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = hot ? C.accent : 'rgba(255,255,255,0.92)'; ctx.fill();
  ctx.strokeStyle = hot ? C.accent : '#9aa5b6'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = hot ? '#fff' : '#5c6b82'; ctx.lineWidth = 1.6; ctx.beginPath();
  ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, 0); ctx.moveTo(0, -3.5); ctx.lineTo(0, 3.5); ctx.stroke();
  ctx.restore();
}

function rectAround(cx, cy, z = 0) {
  const [sx, sy] = iso(cx, cy, 14 + z);
  return [[sx - 17, sy - 46], [sx + 17, sy - 46], [sx + 17, sy + 12], [sx - 17, sy + 12]];
}
const floorPoly = (x, y, w, d, z = 0) => [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)];

export function keyOf(target) {
  if (!target) return '';
  return [target.type, target.room ?? '', target.areaId ?? '', target.seat ?? '', target.agentId ?? ''].join(':');
}

// The mezzanine with the Big Boss and Chief of Staff rooms. Everything on it is drawn one floor up.
function mezzanine(ctx, view, t, hits, hot) {
  const { working } = view;
  wallY(ctx, 0, MEZ_W, ROOM_D, 0, MZ - 5, B.g900); wallX(ctx, MEZ_W, 0, ROOM_D, 0, MZ - 5, shade(B.g900, 0.8));
  wallY(ctx, 0, MEZ_W, ROOM_D, MZ - 5, MZ, '#f4f5f6', EDGE); wallX(ctx, MEZ_W, 0, ROOM_D, MZ - 5, MZ, '#e3e5e9', EDGE);
  logoOnWallY(ctx, 2.0, ROOM_D + 0.01, 5.4, 52);

  const items = [];
  const add = (k, f) => items.push({ k, f });
  ctx.save(); ctx.translate(0, -MZ);
  quad(ctx, 0, 0, 7, ROOM_D, C.boss); quad(ctx, 7, 0, 7, ROOM_D, C.cos);
  quad(ctx, 1.5, 1.1, 4.2, 4.0, C.bossRug); quad(ctx, 1.65, 1.25, 3.9, 3.7, null, 'rgba(255,255,255,0.35)');
  quad(ctx, 8.4, 1.1, 4.2, 4.0, C.cosRug);
  quad(ctx, 2.25, 2.55, 2.9, 1.2, SHADOW); quad(ctx, 9.25, 2.55, 2.9, 1.2, SHADOW);
  for (const r of [{ room: 'boss', x: 0 }, { room: 'cos', x: 7 }]) {
    const target = { type: 'room', room: r.room };
    hits.push({ poly: floorPoly(r.x, 0, 7, ROOM_D, MZ), target });
    if (hot(target)) poly(ctx, floorPoly(r.x, 0, 7, ROOM_D), HOT_FILL, HOT_LINE);
  }
  // walls of the upper floor
  wallX(ctx, 0.01, 0.7, 3.0, 30, 82, C.sky, 'rgba(255,255,255,0.9)'); wallX(ctx, 0.01, 1.83, 1.87, 30, 82, '#ffffff');
  wallY(ctx, 1.5, 5.5, 0.01, 22, 80, B.g900); logoOnWallY(ctx, 1.95, 0.02, 3.1, 64);
  wallY(ctx, 11.6, 13.2, 0.01, 30, 78, '#ffffff', 'rgba(38,50,72,0.25)'); wallY(ctx, 11.6, 13.2, 0.02, 72, 78, B.g700);
  for (let i = 0; i < 4; i++) {
    wallY(ctx, 11.75, 11.9, 0.02, 61 - i * 8, 66 - i * 8, B.g500);
    wallY(ctx, 12.0, 12.8 + (i % 2) * 0.25, 0.02, 62.5 - i * 8, 64.5 - i * 8, '#c9d0da');
  }

  add(BOSS.x + BOSS.y, (c) => seat(c, BOSS.x, BOSS.y, 'SW', 'boss'));
  add(6.4, (c) => execDesk(c, 2.1, 2.4, B.g900, false, t));
  add(7.3, (c) => seat(c, 2.9, 4.4, 'NE', null));
  add(8.6, (c) => seat(c, 4.2, 4.4, 'NE', null));
  add(4.9, (c) => {
    box(c, 0.12, 3.5, 0, 0.5, 2.0, 62, C.white);
    const cols = [B.g900, B.silver, B.g500, B.navy, B.g700, '#e9ecee'];
    for (let i = 0; i < 3; i++) {
      wallX(c, 0.63, 3.6, 5.4, 6 + i * 19, 22 + i * 19, '#eef1f5');
      for (let b = 0; b < 7; b++) wallX(c, 0.64, 3.7 + b * 0.2, 3.86 + b * 0.2, 6 + i * 19, 17 + i * 19 - (b % 3), cols[(b + i * 2) % cols.length]);
    }
  });
  add(1.4, (c) => plant(c, 0.7, 0.7)); add(7.0, (c) => plant(c, 6.2, 0.8, 0.85));
  hits.push({ poly: rectAround(BOSS.x, BOSS.y, MZ), target: { type: 'room', room: 'boss' } });

  add(COS.x + COS.y, (c) => seat(c, COS.x, COS.y, 'SW', 'cos'));
  add(13.4, (c) => execDesk(c, 9.1, 2.4, B.slate, working.has('cos'), t, view.counts.cos));
  add(14.9, (c) => seat(c, 10.5, 4.4, 'NE', null));
  add(8.5, (c) => {
    box(c, 7.4, 0.15, 0, 1.5, 0.6, 38, C.white);
    for (let i = 0; i < 3; i++) { wallY(c, 7.46, 8.84, 0.76, 3 + i * 12, 13 + i * 12, '#f1f3f6', 'rgba(38,50,72,0.15)'); wallY(c, 8.05, 8.25, 0.77, 9 + i * 12, 10.5 + i * 12, C.metal); }
  });
  add(14.1, (c) => plant(c, 13.3, 0.8, 0.9));
  hits.push({ poly: rectAround(COS.x, COS.y, MZ), target: { type: 'room', room: 'cos' } });

  // glass between the rooms (door near the front) and the railing around the edge (gap at the stairs)
  for (let j = 0; j < ROOM_D; j++) { if (j !== 4) add(7 + j + 0.5, (c) => glassX(c, 7, j, 52)); add(MEZ_W + j + 0.5, (c) => glassX(c, MEZ_W - 0.02, j, 30)); }
  for (let i = 0; i < MEZ_W; i++) if (i !== 10) add(i + ROOM_D + 0.5, (c) => glassY(c, i, ROOM_D - 0.02, 30));
  for (const [px, py, h] of [[7, 4, 52], [7, 5, 52], [10, 5.96, 30], [11, 5.96, 30], [0.04, 5.96, 30], [MEZ_W - 0.04, 5.96, 30]]) add(px + py + 0.02, (c) => post(c, px, py, h));

  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f(ctx);
  ctx.restore();
}

/**
 * view: { state, working:Set<agentId>, hover, selected, zoom, flights, counts:{boss, cos}, load:{[areaId]: number[5]} }
 * Returns the hit regions (later entries are on top).
 */
export function render(ctx, view, t) {
  const { state, working } = view;
  const hits = [];
  const items = [];
  const overlay = [];
  const ls = Math.max(0.45, Math.min(1.7, 1 / view.zoom)); // keeps labels readable when zoomed out
  const add = (k, f) => items.push({ k, f });
  const addPlant = (x, y, s = 1) => add(x + y, (c) => plant(c, x, y, s));
  const hot = (target) => keyOf(target) === keyOf(view.hover) || keyOf(target) === keyOf(view.selected);

  shell(ctx);
  mezzanine(ctx, view, t, hits, hot);

  // ---- stairs up to the mezzanine
  for (let i = 0; i < 8; i++) {
    const x0 = MEZ_W - (i + 1) * 0.5;
    add(x0 + 0.25 + ROOM_D + 0.65, (c) => box(c, x0, ROOM_D, 0, 0.5, 1.3, (i + 1) * 8, '#f1f2f4'));
  }
  add(MEZ_W + ROOM_D + 1.31, (c) => {
    const y = ROOM_D + 1.3;
    poly(c, [iso(MEZ_W, y, 26), iso(10, y, MZ + 26), iso(10, y, MZ), iso(MEZ_W, y, 0)], C.glass, 'rgba(38,50,72,0.2)');
    line(c, iso(MEZ_W, y, 26), iso(10, y, MZ + 26), '#f4f6f9', 2);
  });

  // ---- Copa
  add(16.9, (c) => {
    box(c, 14.5, 0.15, 0, 3.8, 0.8, 24, C.white);
    for (let i = 0; i < 4; i++) wallY(c, 14.56 + i * 0.95, 15.4 + i * 0.95, 0.96, 3, 21, '#f6f7f9', 'rgba(38,50,72,0.14)');
    box(c, 14.45, 0.1, 24, 3.9, 0.9, 3, C.wood);
    box(c, 14.8, 0.3, 27, 0.46, 0.42, 17, B.slate); wallY(c, 14.9, 15.16, 0.73, 30, 37, '#11151b'); wallY(c, 14.98, 15.08, 0.74, 40, 42, B.g500);
    box(c, 15.38, 0.5, 27, 0.1, 0.1, 4, C.white); box(c, 15.52, 0.58, 27, 0.1, 0.1, 4, C.white);
    box(c, 15.9, 0.28, 27, 0.72, 0.46, 12, '#e9ecf0'); wallY(c, 15.95, 16.42, 0.75, 29, 37, '#2c3545');
    quad(c, 17.0, 0.3, 0.8, 0.5, '#cfd6de', 'rgba(38,50,72,0.25)', 27.2); box(c, 17.36, 0.24, 27, 0.06, 0.06, 8, C.metal, { stroke: null });
  });
  add(19.6, (c) => {
    box(c, 18.7, 0.15, 0, 0.95, 0.8, 68, '#eef1f4');
    wallY(c, 18.7, 19.65, 0.96, 40, 41, '#c5ccd6'); wallY(c, 18.78, 18.82, 0.96, 44, 60, '#aab3c0'); wallY(c, 18.78, 18.82, 0.96, 18, 36, '#aab3c0');
  });
  add(19.7, (c) => stool(c, 17.0, 2.7));
  add(19.71, (c) => stool(c, 15.9, 3.8));
  add(20.8, (c) => { box(c, 16.9, 3.7, 0, 0.2, 0.2, 26, C.metal, { stroke: null }); box(c, 16.2, 3.0, 26, 1.6, 1.6, 3, C.white); box(c, 16.85, 3.5, 29, 0.12, 0.12, 5, C.white); box(c, 17.2, 3.9, 29, 0.12, 0.12, 5, B.g500); });
  add(21.9, (c) => stool(c, 18.1, 3.8));
  add(21.91, (c) => stool(c, 17.0, 4.9));
  add(19.3, (c) => { box(c, 14.35, 4.6, 0, 0.45, 0.45, 30, C.white); box(c, 14.42, 4.67, 30, 0.31, 0.31, 15, '#cfe6e5'); wallY(c, 14.5, 14.65, 5.06, 18, 22, B.g500); });
  addPlant(20.3, 5.3, 0.9);

  // ---- Lazer: lounge, table tennis and the padel court
  add(23.8, (c) => {
    box(c, 21.6, 0.15, 0, 3.2, 0.28, 27, '#c9d0da');
    box(c, 21.45, 0.15, 0, 0.2, 1.15, 19, '#c9d0da');
    box(c, 21.65, 0.4, 0, 3.1, 0.9, 11, '#d6dce4');
    box(c, 21.8, 0.42, 11, 0.5, 0.2, 9, B.g500); box(c, 23.9, 0.42, 11, 0.5, 0.2, 9, B.navy);
    box(c, 24.75, 0.15, 0, 0.2, 1.15, 19, '#c9d0da');
  });
  add(25.4, (c) => { box(c, 22.5, 1.8, 0, 1.4, 0.7, 8, C.white); box(c, 22.45, 1.75, 8, 1.5, 0.8, 2, C.wood); box(c, 22.8, 2.0, 10, 0.3, 0.22, 1.5, B.g500); });
  add(31.4, (c) => {
    for (const [lx, ly] of [[26.1, 3.5], [28.4, 3.5], [26.1, 4.6], [28.4, 4.6]]) box(c, lx, ly, 0, 0.1, 0.1, 20, B.slate, { stroke: null });
    box(c, 26.0, 3.4, 20, 2.6, 1.4, 2, B.g700);
    quad(c, 26.05, 3.45, 2.5, 1.3, null, 'rgba(255,255,255,0.85)', 22.1);
    line(c, iso(26.05, 4.1, 22.1), iso(28.55, 4.1, 22.1), 'rgba(255,255,255,0.85)', 1);
    wallX(c, 27.3, 3.38, 4.82, 22, 27, 'rgba(255,255,255,0.75)', 'rgba(38,50,72,0.3)');
    box(c, 26.5, 3.7, 22, 0.24, 0.16, 1, '#ffffff', { stroke: null }); box(c, 28.0, 4.3, 22, 0.24, 0.16, 1, B.navy, { stroke: null });
  });
  add(31.9, (c) => beanbag(c, 29.6, 2.3, B.g500));
  add(34.3, (c) => beanbag(c, 30.4, 3.9, B.navy));
  add(36.0, (c) => { box(c, 32.8, 0.4, 0, 4.0, 0.6, 9, C.white); box(c, 32.8, 0.25, 9, 4.0, 0.15, 12, '#e9ecf0'); box(c, 33.2, 0.55, 9, 0.5, 0.3, 4, B.g500); });
  addPlant(31.9, 0.7); addPlant(37.3, 0.7); addPlant(21.2, 5.3, 0.85);
  add(COURT.x + COURT.y, (c) => courtGlass(c, false));
  add(COURT.x + COURT.w + COURT.y + COURT.l, (c) => courtGlass(c, true));
  const cp = iso(COURT.x + COURT.w / 2, COURT.y, 74);
  overlay.push((c) => pill(c, cp[0], cp[1], 'Quadra de padel', ls));
  addPlant(37.3, 21.2); addPlant(32.0, 21.2);

  // ---- open office plants
  addPlant(0.7, 7.2); addPlant(0.7, 21.2); addPlant(30.7, 21.2); addPlant(30.7, 7.2);

  // ---- team tables, seats, people and dashboards
  const areaById = Object.fromEntries(state.areas.map((a) => [a.id, a]));
  for (const tb of TABLES) {
    const area = areaById[tb.id] || { id: tb.id, name: '' };
    const defined = !!area.name;
    const bySeat = {};
    for (const a of state.agents) if (a.area_id === tb.id) bySeat[a.seat] = a;
    const areaTarget = { type: 'area', areaId: tb.id };

    add(tb.tx + tb.ty + 5.75, (c) => teamTable(c, tb, working, bySeat, t));
    const slab = floorPoly(tb.tx + 1, tb.ty, TABLE_L, TABLE_D, 23);
    hits.push({ poly: slab, target: areaTarget });
    if (hot(areaTarget)) overlay.push((c) => poly(c, slab, HOT_FILL, HOT_LINE));

    for (let s = 0; s <= state.seats_per_area; s++) {
      const p = seatPos(tb.id, s);
      const agent = bySeat[s];
      // far-side seats are always behind the table and near-side ones in front of it
      add(p.x + p.y + (s === 0 ? 0 : s <= 3 ? -0.3 : 0.3), (c) => seat(c, p.x, p.y, p.facing, agent ? agent.look : null));
      let target;
      if (s === 0) target = areaTarget;
      else if (agent) target = { type: 'agent', agentId: agent.id };
      else target = { type: 'seat', areaId: tb.id, seat: s };
      hits.push({ poly: rectAround(p.x, p.y), target });
      const [sx, sy] = iso(p.x, p.y, 14);
      if (s > 0 && hot(target)) {
        const ring = floorPoly(p.x - 0.42, p.y - 0.42, 0.84, 0.84);
        overlay.push((c) => poly(c, ring, HOT_FILL, HOT_LINE));
      }
      if (!agent && (s === 0 || defined)) overlay.push((c) => plus(c, sx, sy - 18, ls, hot(target)));
      if (agent && working.has(agent.id)) overlay.push((c) => bubble(c, sx + 16 * ls, sy - 46, t, ls));
    }

    const dashTarget = { type: 'dash', areaId: tb.id };
    const dx = tb.tx + 8.0, mid = tb.ty + TABLE_D / 2;
    add(dx + mid, (c) => dashScreen(c, tb, view.load[tb.id] || [0, 0, 0, 0, 0]));
    const screen = [iso(dx, tb.ty + 0.25, 64), iso(dx, tb.ty + TABLE_D - 0.25, 64), iso(dx, tb.ty + TABLE_D - 0.25, 28), iso(dx, tb.ty + 0.25, 28)];
    hits.push({ poly: screen, target: dashTarget });
    if (hot(dashTarget)) overlay.push((c) => poly(c, screen, 'rgba(255,255,255,0.14)', '#ffffff'));

    const hp = iso(tb.tx - 0.35, tb.ty + TABLE_D / 2 + 0.8);
    const name = area.name.length > 24 ? `${area.name.slice(0, 23)}…` : area.name;
    overlay.push((c) => pill(c, hp[0], hp[1], defined ? name : `Mesa ${tb.id} · livre`, ls, defined ? { bg: C.ink, fg: '#fff' } : { dashed: true, fg: '#5c6b82' }));
  }

  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f(ctx);

  // ---- overlay: labels, badges, bubbles, papers in transit
  for (const f of overlay) f(ctx);
  const label = (x, h, text) => { const p = iso(x, 0, h); pill(ctx, p[0], p[1] - 14 * ls, text, ls); };
  label(3.5, WALL_HIGH, 'Sala do Big Boss'); label(10.5, WALL_HIGH, 'Chief of Staff'); label(17.5, WALL_LOW, 'Copa'); label(26, WALL_LOW, 'Lazer');
  const bp = iso(BOSS.x, BOSS.y, 14 + MZ), cos = iso(COS.x, COS.y, 14 + MZ);
  if (view.counts.boss) badge(ctx, bp[0] + 14 * ls, bp[1] - 48, view.counts.boss, B.g500, ls);
  if (working.has('cos')) bubble(ctx, cos[0] + 16 * ls, cos[1] - 46, t, ls);
  else if (view.counts.cos) badge(ctx, cos[0] + 14 * ls, cos[1] - 48, view.counts.cos, B.g500, ls);

  for (const f of view.flights) {
    const u = Math.min(1, (t - f.t0) / f.dur);
    if (u < 0) continue;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const a = iso(f.from.x, f.from.y, 40 + (f.from.z || 0)), b = iso(f.to.x, f.to.y, 40 + (f.to.z || 0));
    const x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e - Math.sin(e * Math.PI) * 46;
    ctx.save(); ctx.translate(x, y); ctx.scale(ls, ls);
    ctx.shadowColor = 'rgba(20, 30, 60, 0.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(-7, -9, 14, 18); ctx.shadowColor = 'transparent';
    ctx.fillStyle = f.color || C.accent; ctx.fillRect(-7, -9, 14, 4);
    ctx.fillStyle = '#c5ccd6'; for (let i = 0; i < 3; i++) ctx.fillRect(-4, -2 + i * 3.5, 8, 1.5);
    ctx.restore();
  }
  return hits;
}
