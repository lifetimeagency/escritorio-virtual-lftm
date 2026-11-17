// Bootstrap: camera, pointer input, live refresh and the render loop.
import { api } from './api.js';
import { inPoly } from './iso.js';
import { render, bounds, keyOf, seatPos, assets, BOSS, COS } from './scene.js';
import { createUI, AWAITING } from './ui.js';
import { createDashboard } from './dashboard.js';
import { createLife } from './life.js';

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

const store = { state: null, working: new Set(), hover: null, selected: null, flights: [] };
const life = createLife();
const cam = { x: 0, y: 0, zoom: 1, auto: true };
let hits = [];
let dirty = true;
let size = { w: 0, h: 0 };

// ---- camera
function fit() {
  const b = bounds();
  const z = Math.min(size.w / (b.maxX - b.minX), size.h / (b.maxY - b.minY));
  cam.zoom = Math.max(0.35, Math.min(2.2, z));
  cam.x = size.w / 2 - ((b.minX + b.maxX) / 2) * cam.zoom;
  cam.y = size.h / 2 - ((b.minY + b.maxY) / 2) * cam.zoom;
  cam.auto = true; dirty = true;
}
function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const before = size;
  size = { w: r.width, h: r.height };
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  if (cam.auto || !before.w) fit(); else { cam.x += (size.w - before.w) / 2; cam.y += (size.h - before.h) / 2; }
  dirty = true;
}
function zoomAt(px, py, factor) {
  const z = Math.max(0.35, Math.min(3, cam.zoom * factor));
  cam.x = px - ((px - cam.x) / cam.zoom) * z; cam.y = py - ((py - cam.y) / cam.zoom) * z;
  cam.zoom = z; cam.auto = false; dirty = true;
}

// ---- live state
function positionOf(who, state) {
  if (who === 'boss') return BOSS;
  if (who === 'cos') return COS;
  const a = state.agents.find((x) => x.id === who);
  return a ? seatPos(a.area_id, a.seat) : null;
}
function fly(state, from, to, color, delay = 0) {
  const a = positionOf(from, state), b = positionOf(to, state);
  if (a && b) store.flights.push({ from: a, to: b, color, t0: performance.now() + delay, dur: 1100 });
}
// Turns task changes between two refreshes into papers flying across the office.
function animateChanges(prev, next) {
  const before = Object.fromEntries(prev.tasks.map((t) => [t.id, t]));
  for (const t of next.tasks) {
    const head = next.agents.find((a) => a.area_id === t.area_id && a.kind === 'head')?.id;
    const old = before[t.id];
    if (!head) continue;
    if (!old) { fly(next, 'boss', head); continue; }
    const was = old.status, now = t.status;
    const stage = t.activity?.stage, oldStage = old.activity?.stage;
    if (now === 'in_production' && stage === 'executing' && oldStage !== 'executing') t.activity.agent_ids.forEach((id) => fly(next, head, id));
    if (oldStage === 'executing' && stage !== 'executing') old.activity.agent_ids.forEach((id) => fly(next, id, head));
    if (was === now) continue;
    if (was === 'in_production' && now !== 'failed' && now !== 'cancelled') fly(next, head, 'cos');
    const afterReview = was === 'in_production' ? 900 : 0;
    if (was === 'in_production' || was === 'in_review') {
      if (now === 'delivered') fly(next, 'cos', 'boss', '#118282', afterReview);
      else if (now === 'escalated') fly(next, 'cos', 'boss', '#c0453f', afterReview);
      else if (now === 'in_production' && was === 'in_review') fly(next, 'cos', head, '#c0453f');
    }
    if (AWAITING.includes(was) && now === 'in_production') fly(next, 'boss', head);
  }
}

let ui;
async function reload() {
  const next = await api.state();
  if (store.state) animateChanges(store.state, next);
  store.state = next;
  store.working = new Set(next.tasks.flatMap((t) => (['in_production', 'in_review'].includes(t.status) && t.activity ? t.activity.agent_ids : [])));
  life.sync(next, store.working, performance.now());
  ui.onState();
  dashboard.refresh();
  dirty = true;
}

// ---- pointer input
function targetAt(px, py) {
  const wx = (px - cam.x) / cam.zoom, wy = (py - cam.y) / cam.zoom;
  for (let i = hits.length - 1; i >= 0; i--) if (inPoly(hits[i].poly, wx, wy)) return hits[i].target;
  return null;
}
function describe(target) {
  const s = store.state;
  if (target.type === 'room') return target.room === 'boss' ? 'Sala do Big Boss — delegar tarefas e receber entregas' : 'Chief of Staff — padrões de qualidade e revisões';
  const area = s.areas.find((a) => a.id === target.areaId);
  if (target.type === 'area') {
    const head = s.agents.find((a) => a.area_id === target.areaId && a.kind === 'head');
    return area.name ? `${area.name} — Head: ${head?.name || ''}` : `Mesa ${area.id} — definir área e Head`;
  }
  if (target.type === 'seat') return area.name ? `Contratar agente para ${area.name}` : 'Defina a área antes de contratar';
  if (target.type === 'dash') return area.name ? `Dashboard de ${area.name}` : 'Dashboard da agência';
  const a = s.agents.find((x) => x.id === target.agentId);
  return a ? `${a.name} · ${a.role} — ${life.activity(a.id, store.working)}` : '';
}

const pointers = new Map();
let drag = null;
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  drag = { x: e.offsetX, y: e.offsetY, moved: false };
  pinch = 0;
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch);
    pinch = dist; if (drag) drag.moved = true;
    return;
  }
  if (drag && pointers.size === 1) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (drag.moved || Math.hypot(dx, dy) > 4) {
      drag.moved = true; cam.x += dx; cam.y += dy; cam.auto = false;
      drag.x = e.offsetX; drag.y = e.offsetY; dirty = true;
      canvas.classList.add('dragging'); tooltip.hidden = true;
    }
    return;
  }
  if (!store.state) return;
  const target = targetAt(e.offsetX, e.offsetY);
  if (keyOf(target) !== keyOf(store.hover)) { store.hover = target; dirty = true; }
  canvas.classList.toggle('pointing', !!target);
  tooltip.hidden = !target || e.pointerType === 'touch';
  if (target) { tooltip.textContent = describe(target); tooltip.style.left = `${e.offsetX}px`; tooltip.style.top = `${e.offsetY}px`; }
});
function release(e) {
  pointers.delete(e.pointerId);
  canvas.classList.remove('dragging');
  tooltip.hidden = true;
  if (drag && !drag.moved && e.type === 'pointerup' && store.state) {
    const target = targetAt(e.offsetX, e.offsetY);
    if (target) ui.openTarget(target);
  }
  if (!pointers.size) drag = null;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { if (store.hover) { store.hover = null; dirty = true; } tooltip.hidden = true; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
document.getElementById('zoom-in').addEventListener('click', () => zoomAt(size.w / 2, size.h / 2, 1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoomAt(size.w / 2, size.h / 2, 0.8));
document.getElementById('zoom-fit').addEventListener('click', fit);
new ResizeObserver(resize).observe(canvas);
assets.logo.addEventListener('load', () => { dirty = true; });
// Canvas labels are drawn with the brand typeface: repaint once it has loaded.
document.fonts?.load('600 11px urbane').then(() => { dirty = true; }).catch(() => {});

// ---- render loop
let lastStep = 0, lastDraw = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!store.state || !size.w) return;
  life.step(t, lastStep ? t - lastStep : 0, store.working);
  lastStep = t;
  store.flights = store.flights.filter((f) => t < f.t0 + f.dur);
  const animating = store.working.size > 0 || store.flights.length > 0 || life.busy();
  // full speed for papers in flight; people walking and playing look fine at ~30 fps
  if (!dirty && (!animating || (!store.flights.length && t - lastDraw < 32))) return;
  dirty = false; lastDraw = t;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  ctx.imageSmoothingEnabled = false;
  const counts = {
    boss: store.state.tasks.filter((x) => AWAITING.includes(x.status)).length,
    cos: store.state.tasks.filter((x) => x.status === 'in_review').length,
  };
  // per-area levels for the wall screens: in production, with the CoS, awaiting the boss, approved, failed
  const load = {};
  for (const x of store.state.tasks) {
    const i = { in_production: 0, in_review: 1, delivered: 2, escalated: 2, approved: 3, failed: 4 }[x.status];
    if (i === undefined) continue;
    (load[x.area_id] ||= [0, 0, 0, 0, 0])[i] += 1;
  }
  for (const k of Object.keys(load)) { const max = Math.max(...load[k]); load[k] = load[k].map((v) => v / max); }
  hits = render(ctx, { state: store.state, working: store.working, hover: store.hover, selected: store.selected, zoom: cam.zoom, flights: store.flights, counts, load, life }, t);
}

let dashboard;
ui = createUI({ store, reload, onChange: () => { dirty = true; }, openDashboard: (areaId) => dashboard.show(areaId) });
dashboard = createDashboard({ store, api, openTask: (id) => ui.openTask(id) });
resize();
reload().catch((e) => ui.toast(e.message, true));
setInterval(() => { if (!document.hidden) reload().catch(() => {}); }, 1500);
requestAnimationFrame(frame);

// Installable on phones (home screen) when served by the server version; the Artifact runs inside Claude.
if ('serviceWorker' in navigator && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
