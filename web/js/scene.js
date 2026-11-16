// The office: layout, furniture and people. render() draws one frame and returns the clickable regions.
import { iso, box, quad, wallX, wallY, poly, shade } from './iso.js';
import { drawAvatar } from './avatars.js';

export const W = 26, D = 20, ROOM_D = 6, WALL_H = 96;
export const BOSS = { x: 3, y: 1.6 };
export const COS = { x: 9, y: 1.6 };
export const TABLES = [
  { id: 1, tx: 2, ty: 9 }, { id: 2, tx: 10, ty: 9 }, { id: 3, tx: 18, ty: 9 },
  { id: 4, tx: 2, ty: 15 }, { id: 5, tx: 10, ty: 15 }, { id: 6, tx: 18, ty: 15 },
];

const C = {
  wall: '#f7f8fa', wallDim: '#eceff3', cap: '#ffffff',
  floor: '#eadfce', plank: 'rgba(120, 90, 50, 0.09)',
  boss: '#d9dfe8', bossRug: '#44547a', cos: '#e3e8ef', cosRug: '#b9c9d6',
  copaA: '#f8f9fb', copaB: '#e6eaef', lazer: '#d3e8db', lazerRug: '#a9d1bb',
  desk: '#fcfdfe', metal: '#c5ccd6', wood: '#d6b891', chair: '#eef1f5', chairBase: '#8f99a8',
  white: '#ffffff', screenOff: '#2c3545', glass: 'rgba(160, 200, 235, 0.18)',
  ink: '#1f2a44', accent: '#3b6cf6', ok: '#2fa36b', bad: '#d9534f',
};
const SHADOW = 'rgba(40, 30, 10, 0.08)';

export function seatPos(areaId, seat) {
  const t = TABLES[areaId - 1];
  if (seat === 0) return { x: t.tx + 0.5, y: t.ty + 1, facing: 'SE' };
  if (seat <= 3) return { x: t.tx + 1.5 + seat, y: t.ty - 0.5, facing: 'SW' };
  return { x: t.tx + 1.5 + (seat - 3), y: t.ty + 2.5, facing: 'NE' };
}

export function bounds() {
  return { minX: -D * 32 - 20, maxX: W * 32 + 20, minY: -WALL_H - 50, maxY: (W + D) * 16 + 20 };
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

// Four white monitors (2x2) on one stand. axis 'x': screens face +y (visible) or -y (we see the backs).
function monitors(ctx, mx, my, z, axis, showScreen, lit, t) {
  const stand = () => {
    if (axis === 'x') { box(ctx, mx - 0.16, my - 0.1, z, 0.32, 0.2, 1.5, C.metal, { stroke: null }); box(ctx, mx - 0.04, my - 0.04, z, 0.08, 0.08, 30, C.metal, { stroke: null }); }
    else { box(ctx, mx - 0.1, my - 0.16, z, 0.2, 0.32, 1.5, C.metal, { stroke: null }); box(ctx, mx - 0.04, my - 0.04, z, 0.08, 0.08, 30, C.metal, { stroke: null }); }
  };
  if (showScreen) stand();
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 2; row++) {
      const z0 = z + 7 + row * 15;
      const o = -0.47 + col * 0.48;
      if (axis === 'x') {
        box(ctx, mx + o, my - 0.035, z0, 0.46, 0.07, 13, C.white);
        if (showScreen) {
          const on = lit ? ['#8fd0ff', '#b9e4ff', '#a6dbff'][(Math.floor(t / 420) + col + row * 2) % 3] : C.screenOff;
          wallY(ctx, mx + o + 0.035, mx + o + 0.425, my + 0.036, z0 + 1.6, z0 + 11.4, on);
          if (lit) for (let i = 0; i < 3; i++) wallY(ctx, mx + o + 0.07, mx + o + 0.2 + ((i * 7 + col * 3) % 5) * 0.04, my + 0.037, z0 + 3 + i * 3, z0 + 4 + i * 3, 'rgba(255,255,255,0.75)');
        } else {
          wallY(ctx, mx + o + 0.19, mx + o + 0.27, my + 0.036, z0 + 5, z0 + 8, '#dfe4ea');
        }
      } else {
        box(ctx, mx - 0.035, my + o, z0, 0.07, 0.46, 13, C.white);
        wallX(ctx, mx + 0.036, my + o + 0.19, my + o + 0.27, z0 + 5, z0 + 8, '#dfe4ea');
      }
    }
  }
  if (!showScreen) stand();
}

function keyboard(ctx, x, y, z, axis) {
  if (axis === 'x') { box(ctx, x - 0.2, y - 0.07, z, 0.4, 0.14, 1.2, '#f1f3f6'); box(ctx, x + 0.27, y - 0.04, z, 0.07, 0.1, 1.2, '#f1f3f6'); }
  else { box(ctx, x - 0.07, y - 0.2, z, 0.14, 0.4, 1.2, '#f1f3f6'); box(ctx, x - 0.04, y + 0.27, z, 0.1, 0.07, 1.2, '#f1f3f6'); }
}

function teamTable(ctx, tb, working, agentsBySeat, t) {
  const x0 = tb.tx + 1, y0 = tb.ty, z = 20;
  for (const [lx, ly] of [[x0 + 0.05, y0 + 0.05], [x0 + 3.83, y0 + 0.05], [x0 + 0.05, y0 + 1.83], [x0 + 3.83, y0 + 1.83]]) box(ctx, lx, ly, 0, 0.12, 0.12, z, C.metal, { stroke: null });
  box(ctx, x0 + 0.3, y0 + 0.94, 9, 3.4, 0.12, 11, '#e4e8ed', { stroke: null });
  box(ctx, x0, y0, z, 4, 2, 3, C.desk);
  const lit = (s) => agentsBySeat[s] && working.has(agentsBySeat[s].id);
  keyboard(ctx, x0 + 0.22, y0 + 1, z + 3, 'y');
  monitors(ctx, x0 + 0.6, y0 + 1, z + 3, 'y', false, lit(0), t);
  for (let k = 1; k <= 3; k++) { keyboard(ctx, x0 + 0.5 + k, y0 + 0.24, z + 3, 'x'); monitors(ctx, x0 + 0.5 + k, y0 + 0.62, z + 3, 'x', false, lit(k), t); }
  for (let k = 1; k <= 3; k++) { monitors(ctx, x0 + 0.5 + k, y0 + 1.38, z + 3, 'x', true, lit(k + 3), t); keyboard(ctx, x0 + 0.5 + k, y0 + 1.76, z + 3, 'x'); }
}

function execDesk(ctx, x0, y0, panel, lit, t, papers) {
  box(ctx, x0, y0, 0, 0.1, 1, 20, C.desk);
  box(ctx, x0 + 2.3, y0, 0, 0.1, 1, 20, C.desk);
  box(ctx, x0 + 0.1, y0 + 0.86, 3, 2.2, 0.06, 17, panel);
  box(ctx, x0 - 0.05, y0 - 0.05, 20, 2.5, 1.1, 3, C.desk);
  keyboard(ctx, x0 + 1.2, y0 + 0.2, 23, 'x');
  monitors(ctx, x0 + 1.2, y0 + 0.55, 23, 'x', false, lit, t);
  if (papers !== undefined) {
    box(ctx, x0 + 0.15, y0 + 0.25, 23, 0.46, 0.56, 1.5, '#aab3c0');
    if (papers > 0) box(ctx, x0 + 0.18, y0 + 0.28, 24.5, 0.4, 0.5, Math.min(papers, 8) * 2, C.white);
  }
}

function plant(ctx, x, y, s = 1) {
  box(ctx, x - 0.2, y - 0.2, 0, 0.4, 0.4, 13, '#f3f1ec');
  const [sx, sy] = iso(x, y, 13);
  const leaves = [[0, -8, 11, '#3f9459'], [-9, -15, 9, '#4fa66a'], [9, -16, 9, '#4fa66a'], [0, -24, 10, '#5cb779'], [-5, -32, 7, '#4fa66a'], [6, -33, 6, '#6bc487']];
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

function glassY(ctx, i, y) { // partition along x at constant y
  wallY(ctx, i, i + 1, y, 0, 60, C.glass);
  wallY(ctx, i, i + 1, y, 58, 60, '#f4f6f9', 'rgba(38,50,72,0.15)');
  wallY(ctx, i, i + 1, y, 0, 2, '#dfe4ea');
}
function glassX(ctx, x, j) {
  wallX(ctx, x, j, j + 1, 0, 60, C.glass);
  wallX(ctx, x, j, j + 1, 58, 60, '#e9edf2', 'rgba(38,50,72,0.15)');
  wallX(ctx, x, j, j + 1, 0, 2, '#d5dbe3');
}
function post(ctx, x, y) { box(ctx, x - 0.04, y - 0.04, 0, 0.08, 0.08, 60, '#e9edf2', { stroke: 'rgba(38,50,72,0.12)' }); }

// ---------------------------------------------------------------- static shell
function shell(ctx) {
  // back walls
  wallX(ctx, 0, 0, D, 0, WALL_H, C.wallDim, 'rgba(38,50,72,0.12)');
  wallY(ctx, 0, W, 0, 0, WALL_H, C.wall, 'rgba(38,50,72,0.12)');
  quad(ctx, -0.2, -0.2, W + 0.2, 0.2, C.cap, 'rgba(38,50,72,0.12)', WALL_H);
  quad(ctx, -0.2, 0, 0.2, D, C.cap, 'rgba(38,50,72,0.12)', WALL_H);
  wallX(ctx, W, -0.2, 0, 0, WALL_H, shade(C.wallDim, 0.95), 'rgba(38,50,72,0.12)');
  wallY(ctx, -0.2, 0, D, 0, WALL_H, C.wall, 'rgba(38,50,72,0.12)');
  wallX(ctx, 0, 0, D, 0, 4, '#dfe3e9');
  wallY(ctx, 0, W, 0, 0, 4, '#e6e9ee');

  // floors
  quad(ctx, 0, 0, W, D, C.floor);
  quad(ctx, 0, 0, 6, ROOM_D, C.boss);
  quad(ctx, 6, 0, 6, ROOM_D, C.cos);
  for (let x = 12; x < 18; x++) for (let y = 0; y < ROOM_D; y++) quad(ctx, x, y, 1, 1, (x + y) % 2 ? C.copaA : C.copaB);
  quad(ctx, 18, 0, W - 18, ROOM_D, C.lazer);
  ctx.strokeStyle = C.plank; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = ROOM_D + 0.5; y < D; y += 0.5) { const a = iso(0, y), b = iso(W, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  for (let y = 0.5; y < ROOM_D; y += 0.5) { const a = iso(12, y), b = iso(12, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  poly(ctx, [iso(0, 0), iso(W, 0), iso(W, D), iso(0, D)], null, 'rgba(38,50,72,0.25)');

  // rugs and soft shadows
  quad(ctx, 1.2, 1.0, 3.6, 3.8, C.bossRug);
  quad(ctx, 1.35, 1.15, 3.3, 3.5, null, 'rgba(255,255,255,0.35)');
  quad(ctx, 7.2, 1.0, 3.6, 3.8, C.cosRug);
  quad(ctx, 18.5, 1.3, 3.6, 1.5, C.lazerRug);
  for (const tb of TABLES) quad(ctx, tb.tx + 1.15, tb.ty + 0.2, 4, 2, SHADOW);
  quad(ctx, 1.95, 2.35, 2.5, 1.1, SHADOW); quad(ctx, 7.95, 2.35, 2.5, 1.1, SHADOW);
  quad(ctx, 19.15, 3.55, 2.6, 1.4, SHADOW);

  // windows on the left wall, picture and quality board on the back wall
  for (const y0 of [7.4, 11.4, 15.4]) {
    wallX(ctx, 0.01, y0, y0 + 3.2, 30, 82, '#cfe7f8', 'rgba(255,255,255,0.9)');
    wallX(ctx, 0.01, y0 + 1.58, y0 + 1.62, 30, 82, '#ffffff');
    wallX(ctx, 0.01, y0, y0 + 3.2, 28, 30, '#ffffff', 'rgba(38,50,72,0.12)');
  }
  wallX(ctx, 0.01, 1.4, 3.0, 44, 78, '#ffffff', 'rgba(38,50,72,0.2)');
  wallX(ctx, 0.02, 1.55, 2.85, 47, 75, '#dfe7f5');
  wallX(ctx, 0.03, 1.7, 2.3, 50, 62, '#44547a'); wallX(ctx, 0.03, 2.1, 2.7, 56, 70, '#d6b891');
  wallY(ctx, 13.0, 15.6, 0.01, 46, 84, '#cfe7f8', 'rgba(255,255,255,0.9)');
  wallY(ctx, 14.28, 14.32, 0.01, 46, 84, '#ffffff');
  wallY(ctx, 19.2, 24.8, 0.01, 42, 84, '#cfe7f8', 'rgba(255,255,255,0.9)');
  wallY(ctx, 21.98, 22.02, 0.01, 42, 84, '#ffffff');
  // CoS quality board
  wallY(ctx, 9.9, 11.5, 0.01, 38, 84, '#ffffff', 'rgba(38,50,72,0.25)');
  wallY(ctx, 9.9, 11.5, 0.02, 78, 84, C.accent);
  for (let i = 0; i < 4; i++) {
    wallY(ctx, 10.05, 10.2, 0.02, 68 - i * 8, 73 - i * 8, C.ok);
    wallY(ctx, 10.3, 11.1 + (i % 2) * 0.25, 0.02, 69.5 - i * 8, 71.5 - i * 8, '#c9d0da');
  }
}

// ---------------------------------------------------------------- frame
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function pill(ctx, x, y, text, s, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.font = '600 11px Inter, system-ui, sans-serif';
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
  ctx.fillStyle = '#fff'; ctx.font = '700 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

function rectAround(cx, cy) {
  const [sx, sy] = iso(cx, cy, 14);
  return [[sx - 17, sy - 46], [sx + 17, sy - 46], [sx + 17, sy + 12], [sx - 17, sy + 12]];
}
const floorPoly = (x, y, w, d, z = 0) => [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)];

export function keyOf(target) {
  if (!target) return '';
  return [target.type, target.room ?? '', target.areaId ?? '', target.seat ?? '', target.agentId ?? ''].join(':');
}

/**
 * view: { state, working:Set<agentId>, hover, selected, zoom, flights, counts:{boss, cos} }
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

  // rooms (lowest priority hits) and their highlight
  const rooms = [{ room: 'boss', x: 0 }, { room: 'cos', x: 6 }];
  for (const r of rooms) {
    const target = { type: 'room', room: r.room };
    const p = floorPoly(r.x, 0, 6, ROOM_D);
    hits.push({ poly: p, target });
    if (hot(target)) poly(ctx, p, 'rgba(59, 108, 246, 0.10)', 'rgba(59, 108, 246, 0.55)');
  }

  // ---- Big Boss room
  add(BOSS.x + BOSS.y, (c) => seat(c, BOSS.x, BOSS.y, 'SW', 'boss'));
  add(5.7, (c) => execDesk(c, 1.8, 2.2, C.wood, false, t));
  add(6.5, (c) => seat(c, 2.4, 4.1, 'NE', null));
  add(7.7, (c) => seat(c, 3.6, 4.1, 'NE', null));
  add(4.7, (c) => {
    box(c, 0.12, 3.4, 0, 0.5, 2.0, 62, C.white);
    for (let i = 0; i < 3; i++) {
      wallX(c, 0.63, 3.5, 5.3, 6 + i * 19, 22 + i * 19, '#eef1f5');
      const cols = ['#44547a', '#d6b891', '#3b6cf6', '#c5ccd6', '#2fa36b', '#e2725b'];
      for (let b = 0; b < 7; b++) wallX(c, 0.64, 3.6 + b * 0.2, 3.76 + b * 0.2, 6 + i * 19, 17 + i * 19 - (b % 3), cols[(b + i * 2) % cols.length]);
    }
  });
  addPlant(0.7, 0.7); addPlant(5.3, 0.8, 0.85);
  hits.push({ poly: rectAround(BOSS.x, BOSS.y), target: { type: 'room', room: 'boss' } });

  // ---- CoS room
  add(COS.x + COS.y, (c) => seat(c, COS.x, COS.y, 'SW', 'cos'));
  add(11.7, (c) => execDesk(c, 7.8, 2.2, '#dfe4ea', working.has('cos'), t, view.counts.cos));
  add(13.1, (c) => seat(c, 9.0, 4.1, 'NE', null));
  add(7.4, (c) => {
    box(c, 6.3, 0.15, 0, 1.5, 0.6, 38, C.white);
    for (let i = 0; i < 3; i++) { wallY(c, 6.36, 7.74, 0.76, 3 + i * 12, 13 + i * 12, '#f1f3f6', 'rgba(38,50,72,0.15)'); wallY(c, 6.95, 7.15, 0.77, 9 + i * 12, 10.5 + i * 12, C.metal); }
  });
  addPlant(11.4, 0.8, 0.9);
  hits.push({ poly: rectAround(COS.x, COS.y), target: { type: 'room', room: 'cos' } });

  // ---- glass partitions
  for (let j = 0; j < ROOM_D; j++) { add(6 + j + 0.5, (c) => glassX(c, 6, j)); add(12 + j + 0.5, (c) => glassX(c, 12, j)); }
  for (let i = 0; i < 12; i++) if (i !== 4 && i !== 7) add(i + 6.5, (c) => glassY(c, i, ROOM_D));
  for (const [px, py] of [[4, 6], [5, 6], [7, 6], [8, 6], [6, 6], [12, 6], [0.04, 6]]) add(px + py + 0.02, (c) => post(c, px, py));

  // ---- Copa
  add(14.9, (c) => {
    box(c, 12.5, 0.15, 0, 3.8, 0.8, 24, C.white);
    for (let i = 0; i < 4; i++) wallY(c, 12.56 + i * 0.95, 13.4 + i * 0.95, 0.96, 3, 21, '#f6f7f9', 'rgba(38,50,72,0.14)');
    box(c, 12.45, 0.1, 24, 3.9, 0.9, 3, C.wood);
    box(c, 12.8, 0.3, 27, 0.46, 0.42, 17, '#2f343d'); wallY(c, 12.9, 13.16, 0.73, 30, 37, '#11151b'); wallY(c, 12.98, 13.08, 0.74, 40, 42, '#e2725b');
    box(c, 13.38, 0.5, 27, 0.1, 0.1, 4, C.white); box(c, 13.52, 0.58, 27, 0.1, 0.1, 4, C.white);
    box(c, 13.9, 0.28, 27, 0.72, 0.46, 12, '#e9ecf0'); wallY(c, 13.95, 14.42, 0.75, 29, 37, '#2c3545');
    quad(c, 15.0, 0.3, 0.8, 0.5, '#cfd6de', 'rgba(38,50,72,0.25)', 27.2); box(c, 15.36, 0.24, 27, 0.06, 0.06, 8, C.metal, { stroke: null });
  });
  add(17.6, (c) => {
    box(c, 16.7, 0.15, 0, 0.95, 0.8, 68, '#eef1f4');
    wallY(c, 16.7, 17.65, 0.96, 40, 41, '#c5ccd6'); wallY(c, 16.78, 16.82, 0.96, 44, 60, '#aab3c0'); wallY(c, 16.78, 16.82, 0.96, 18, 36, '#aab3c0');
  });
  add(17.0, (c) => stool(c, 15.0, 2.7));
  add(17.7, (c) => stool(c, 13.9, 3.8));
  add(18.8, (c) => { box(c, 14.9, 3.7, 0, 0.2, 0.2, 26, C.metal, { stroke: null }); box(c, 14.2, 3.0, 26, 1.6, 1.6, 3, C.white); box(c, 14.85, 3.5, 29, 0.12, 0.12, 5, C.white); box(c, 15.2, 3.9, 29, 0.12, 0.12, 5, '#f0b541'); });
  add(19.9, (c) => stool(c, 16.1, 3.8));
  add(20.0, (c) => stool(c, 15.0, 4.9));
  add(17.3, (c) => { box(c, 12.35, 4.6, 0, 0.45, 0.45, 30, C.white); box(c, 12.42, 4.67, 30, 0.31, 0.31, 15, '#bfe3f7'); wallY(c, 12.5, 12.65, 5.06, 18, 22, C.accent); });
  addPlant(17.4, 5.4, 0.9);

  // ---- Lazer
  add(20.8, (c) => {
    box(c, 18.6, 0.15, 0, 3.2, 0.28, 27, '#c9d0da');
    box(c, 18.45, 0.15, 0, 0.2, 1.15, 19, '#c9d0da');
    box(c, 18.65, 0.4, 0, 3.1, 0.9, 11, '#d6dce4');
    box(c, 18.8, 0.42, 11, 0.5, 0.2, 9, '#f0b541'); box(c, 20.9, 0.42, 11, 0.5, 0.2, 9, '#3b6cf6');
    box(c, 21.75, 0.15, 0, 0.2, 1.15, 19, '#c9d0da');
  });
  add(22.4, (c) => { box(c, 19.5, 1.8, 0, 1.4, 0.7, 8, C.white); box(c, 19.45, 1.75, 8, 1.5, 0.8, 2, C.wood); box(c, 19.8, 2.0, 10, 0.3, 0.22, 1.5, '#e2725b'); });
  add(24.4, (c) => {
    for (const [lx, ly] of [[19.1, 3.5], [21.4, 3.5], [19.1, 4.6], [21.4, 4.6]]) box(c, lx, ly, 0, 0.1, 0.1, 20, '#5c6b82', { stroke: null });
    box(c, 19.0, 3.4, 20, 2.6, 1.4, 2, '#2f7fbf');
    quad(c, 19.05, 3.45, 2.5, 1.3, null, 'rgba(255,255,255,0.85)', 22.1);
    const a = iso(19.05, 4.1, 22.1), b = iso(21.55, 4.1, 22.1);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    wallX(c, 20.3, 3.38, 4.82, 22, 27, 'rgba(255,255,255,0.75)', 'rgba(38,50,72,0.3)');
    box(c, 19.5, 3.7, 22, 0.24, 0.16, 1, '#e2725b', { stroke: null }); box(c, 21.0, 4.3, 22, 0.24, 0.16, 1, '#2c3545', { stroke: null });
  });
  add(26.3, (c) => beanbag(c, 23.6, 2.7, '#f0b541'));
  add(28.6, (c) => beanbag(c, 24.4, 4.2, '#5cb779'));
  addPlant(25.3, 0.7);
  addPlant(18.5, 5.4, 0.85);

  // ---- open office plants
  addPlant(0.7, 7.2); addPlant(0.7, 19.3); addPlant(W - 0.8, 19.3); addPlant(W - 0.8, 7.2);

  // ---- team tables, seats and people
  const areaById = Object.fromEntries(state.areas.map((a) => [a.id, a]));
  for (const tb of TABLES) {
    const area = areaById[tb.id] || { id: tb.id, name: '' };
    const defined = !!area.name;
    const bySeat = {};
    for (const a of state.agents) if (a.area_id === tb.id) bySeat[a.seat] = a;
    const areaTarget = { type: 'area', areaId: tb.id };

    add(tb.tx + tb.ty + 4.5, (c) => teamTable(c, tb, working, bySeat, t));
    const slab = floorPoly(tb.tx + 1, tb.ty, 4, 2, 23);
    hits.push({ poly: slab, target: areaTarget });
    if (hot(areaTarget)) overlay.push((c) => poly(c, slab, 'rgba(59, 108, 246, 0.10)', 'rgba(59, 108, 246, 0.8)'));

    for (let s = 0; s <= state.seats_per_area; s++) {
      const p = seatPos(tb.id, s);
      const agent = bySeat[s];
      add(p.x + p.y, (c) => seat(c, p.x, p.y, p.facing, agent ? agent.look : null));
      let target;
      if (s === 0) target = areaTarget;
      else if (agent) target = { type: 'agent', agentId: agent.id };
      else target = { type: 'seat', areaId: tb.id, seat: s };
      hits.push({ poly: rectAround(p.x, p.y), target });
      const [sx, sy] = iso(p.x, p.y, 14);
      if (s > 0 && hot(target)) {
        const ring = floorPoly(p.x - 0.42, p.y - 0.42, 0.84, 0.84);
        overlay.push((c) => poly(c, ring, 'rgba(59, 108, 246, 0.14)', 'rgba(59, 108, 246, 0.8)'));
      }
      if (!agent && (s === 0 || defined)) overlay.push((c) => plus(c, sx, sy - 18, ls, hot(target)));
      if (agent && working.has(agent.id)) overlay.push((c) => bubble(c, sx + 16 * ls, sy - 46, t, ls));
    }
    const hp = iso(tb.tx - 0.35, tb.ty + 1.75);
    const name = area.name.length > 24 ? `${area.name.slice(0, 23)}…` : area.name;
    overlay.push((c) => pill(c, hp[0], hp[1], defined ? name : `Mesa ${tb.id} · livre`, ls, defined ? { bg: C.ink, fg: '#fff' } : { dashed: true, fg: '#5c6b82' }));
  }

  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f(ctx);

  // ---- overlay: labels, badges, bubbles, papers in transit
  for (const f of overlay) f(ctx);
  const label = (x, text) => { const p = iso(x, 0, WALL_H); pill(ctx, p[0], p[1] - 14 * ls, text, ls); };
  label(3, 'Sala do Big Boss'); label(9, 'Chief of Staff'); label(15, 'Copa'); label(22, 'Lazer');
  const bp = iso(BOSS.x, BOSS.y, 14), cp = iso(COS.x, COS.y, 14);
  if (view.counts.boss) badge(ctx, bp[0] + 14 * ls, bp[1] - 48, view.counts.boss, C.bad, ls);
  if (working.has('cos')) bubble(ctx, cp[0] + 16 * ls, cp[1] - 46, t, ls);
  else if (view.counts.cos) badge(ctx, cp[0] + 14 * ls, cp[1] - 48, view.counts.cos, C.accent, ls);

  for (const f of view.flights) {
    const u = Math.min(1, (t - f.t0) / f.dur);
    if (u < 0) continue;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const a = iso(f.from.x, f.from.y, 40), b = iso(f.to.x, f.to.y, 40);
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
