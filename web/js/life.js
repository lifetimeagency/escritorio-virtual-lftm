// Office life: idle agents leave their desks for the copa, the lounge and the courts; an agent with work
// stays at (or hurries back to) the desk. Purely visual, simulated in each viewer's browser.
import { seatExit, SPOTS, WALK_H, WALK_V } from './scene.js';

const SPEED = 2.0, HURRY = 3.6;  // tiles per second
const MAX_AWAY = 0.5;            // at most half of the idle team away from their desks at once
const KIND_WEIGHT = { copa: 3, lounge: 2, pingpong: 1.4, padel: 1.4 };
const rnd = (a, b) => a + Math.random() * (b - a);
const keyOf = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
const on = (a, b) => Math.abs(a - b) < 0.01;

// ---------------------------------------------------------------- walkway routing
const CROSSINGS = WALK_V.flatMap((x) => WALK_H.map((y) => [x, y]));

// Points reachable from p in a straight line along a walkway: the nearest one on each side.
function neighbours(p, extra) {
  const pts = [...CROSSINGS, ...extra].filter((q) => keyOf(q) !== keyOf(p));
  const out = [];
  const nearest = (line, axis) => {
    const before = line.filter((q) => q[axis] < p[axis]).sort((a, b) => b[axis] - a[axis])[0];
    const after = line.filter((q) => q[axis] > p[axis]).sort((a, b) => a[axis] - b[axis])[0];
    if (before) out.push(before);
    if (after) out.push(after);
  };
  if (WALK_H.some((h) => on(p[1], h))) nearest(pts.filter((q) => on(q[1], p[1])), 0);
  if (WALK_V.some((v) => on(p[0], v))) nearest(pts.filter((q) => on(q[0], p[0])), 1);
  return out;
}

// Shortest way between two points that both lie on walkways.
function route(a, b) {
  if (keyOf(a) === keyOf(b)) return [a];
  const extra = [a, b];
  const dist = new Map([[keyOf(a), 0]]), prev = new Map(), point = new Map([[keyOf(a), a]]);
  const open = new Set([keyOf(a)]), done = new Set();
  while (open.size) {
    let k = null;
    for (const c of open) if (k === null || dist.get(c) < dist.get(k)) k = c;
    open.delete(k); done.add(k);
    if (k === keyOf(b)) break;
    const p = point.get(k);
    for (const q of neighbours(p, extra)) {
      const qk = keyOf(q);
      if (done.has(qk)) continue;
      const d = dist.get(k) + Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!dist.has(qk) || d < dist.get(qk)) { dist.set(qk, d); prev.set(qk, k); point.set(qk, q); open.add(qk); }
    }
  }
  if (!prev.has(keyOf(b))) return [a, b]; // not on the walkways: go straight
  const path = [b];
  for (let k = keyOf(b); prev.has(k); k = prev.get(k)) path.unshift(point.get(prev.get(k)));
  return path;
}

// ---------------------------------------------------------------- simulation
export function createLife() {
  const actors = new Map();
  const taken = new Map(); // spot id -> agent id
  let balls = [];

  const free = (spot) => !taken.has(spot.id);
  const release = (a) => { for (const [id, who] of taken) if (who === a.id) taken.delete(id); };
  const players = (kind, side) => [...actors.values()].filter((a) => a.mode === 'spot' && a.spot.kind === kind && (side === undefined || a.spot.side === side));

  // Picks somewhere to go, favouring games where someone is already waiting for a partner.
  function chooseSpot(avoidKind) {
    const options = [];
    for (const kind of Object.keys(KIND_WEIGHT)) {
      if (kind === avoidKind) continue;
      const spots = SPOTS.filter((s) => s.kind === kind && free(s));
      if (!spots.length) continue;
      let w = KIND_WEIGHT[kind];
      const occupied = SPOTS.filter((s) => s.kind === kind && !free(s));
      if (kind === 'pingpong' && occupied.length === 1) w *= 4;
      if (kind === 'padel' && occupied.length >= 1) w *= 2.5;
      options.push({ kind, spots, occupied, w });
    }
    if (!options.length) return null;
    let r = Math.random() * options.reduce((n, o) => n + o.w, 0);
    const pick = options.find((o) => (r -= o.w) <= 0) || options[options.length - 1];
    if (pick.kind === 'pingpong' || pick.kind === 'padel') { // join the side with fewer players
      const count = (side) => pick.occupied.filter((s) => s.side === side).length;
      const side = count(0) <= count(1) ? 0 : 1;
      const same = pick.spots.filter((s) => s.side === side);
      if (same.length) return same[Math.floor(Math.random() * same.length)];
    }
    return pick.spots[Math.floor(Math.random() * pick.spots.length)];
  }

  function placeAtSpot(a, spot, now) {
    taken.set(spot.id, a.id);
    Object.assign(a, { mode: 'spot', spot, dest: null, x: spot.x, y: spot.y, z: spot.z, facing: spot.facing, path: null });
    a.next = now + (spot.pose === 'play' ? rnd(25e3, 60e3) : rnd(15e3, 45e3));
  }

  // The way from where the agent is now to the walkways.
  function legsFrom(a) {
    if (a.mode === 'desk') return seatExit(a.area, a.seat);
    if (a.mode === 'spot') return [[a.x, a.y], ...[...a.spot.approach].reverse()];
    const cur = [a.x, a.y], p = a.path, i = a.i;           // walking: reach the walkway along the current path
    if (i <= a.netA) return [cur, ...p.slice(i, a.netA + 1)];
    if (i <= a.netB) return [cur];
    return [cur, ...p.slice(a.netB, i).reverse()];
  }
  function legsTo(a, dest) {
    if (dest.type === 'desk') return [...seatExit(a.area, a.seat)].reverse();
    return [...dest.spot.approach, [dest.spot.x, dest.spot.y]];
  }
  function walk(a, dest, hurry) {
    const from = legsFrom(a), to = legsTo(a, dest);
    const net = route(from[from.length - 1], to[0]);
    release(a);
    if (dest.type === 'spot') taken.set(dest.spot.id, a.id);
    a.path = [...from, ...net.slice(1), ...to.slice(1)];
    a.netA = from.length - 1; a.netB = from.length - 1 + net.length - 1;
    [a.x, a.y] = a.path[0]; // leaving the desk: start from the chair
    a.i = 1; a.mode = 'walk'; a.dest = dest; a.spot = null; a.z = 0; a.hurry = hurry;
  }

  function arrive(a, now) {
    if (a.dest.type === 'desk') {
      Object.assign(a, { mode: 'desk', dest: null, path: null, spot: null });
      a.next = now + rnd(8e3, 25e3);
    } else placeAtSpot(a, a.dest.spot, now);
  }

  function move(a, dt, now) {
    let left = ((a.hurry ? HURRY : SPEED) * dt) / 1000;
    while (left > 0 && a.i < a.path.length) {
      const [tx, ty] = a.path[a.i];
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'SE' : 'NW') : dy > 0 ? 'SW' : 'NE';
      if (d <= left) { a.x = tx; a.y = ty; left -= d; a.i += 1; } else { a.x += (dx / d) * left; a.y += (dy / d) * left; left = 0; }
    }
    if (a.i >= a.path.length) arrive(a, now);
  }

  function decide(a, working, now) {
    if (working.has(a.id)) { // work comes first: back to the desk, quickly
      if (a.mode === 'desk') return;
      if (a.mode === 'walk' && a.dest.type === 'desk') { a.hurry = true; return; }
      walk(a, { type: 'desk' }, true);
      return;
    }
    if (a.mode === 'walk' || now < a.next) return;
    if (a.mode === 'desk') {
      const idle = [...actors.values()].filter((x) => !working.has(x.id));
      const away = idle.filter((x) => x.mode !== 'desk').length;
      const spot = away < Math.max(1, Math.round(idle.length * MAX_AWAY)) && Math.random() < 0.55 ? chooseSpot() : null;
      if (spot) walk(a, { type: 'spot', spot }, false);
      else a.next = now + rnd(8e3, 25e3);
      return;
    }
    const other = Math.random() < 0.35 ? chooseSpot(a.spot.kind) : null;
    walk(a, other ? { type: 'spot', spot: other } : { type: 'desk' }, false);
  }

  function pose(a, now) {
    if (a.mode === 'walk') return Math.floor(now / 170) % 2 ? 'stride' : 'stand';
    if (a.mode === 'spot' && a.spot.pose === 'play') return Math.floor(now / 260) % 2 ? 'stride' : 'stand';
    return a.mode === 'spot' ? a.spot.pose : 'sit';
  }

  // A ball goes back and forth when there is at least one player on each side.
  function rally(kind, period, height, ground, color, now, inset) {
    const a = players(kind, 0)[0], b = players(kind, 1)[0];
    if (!a || !b) return null;
    const u = (now % (2 * period)) / period, f = u <= 1 ? u : 2 - u, arc = Math.sin(Math.PI * (u % 1));
    const ax = a.x + (b.x - a.x) * inset, ay = a.y + (b.y - a.y) * inset, bx = b.x + (a.x - b.x) * inset, by = b.y + (a.y - b.y) * inset;
    return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, z: ground + 6 + arc * height, ground, color };
  }

  return {
    actors,
    get balls() { return balls; },

    // Keeps one actor per agent (Big Boss and CoS stay upstairs). New agents start at their desks,
    // except on the first load, when some are already around the office.
    sync(state, working, now) {
      const first = actors.size === 0;
      const ids = new Set();
      for (const ag of state.agents) {
        ids.add(ag.id);
        const a = actors.get(ag.id);
        if (a) { a.look = ag.look; a.name = ag.name; continue; }
        const actor = { id: ag.id, name: ag.name, look: ag.look, area: ag.area_id, seat: ag.seat, mode: 'desk', x: 0, y: 0, z: 0, facing: 'SW', next: now + rnd(4e3, 30e3) };
        actors.set(ag.id, actor);
        if (first && !working.has(ag.id) && Math.random() < 0.5) {
          const spot = chooseSpot();
          if (spot) placeAtSpot(actor, spot, now - rnd(0, 20e3));
        }
      }
      for (const [id, a] of actors) if (!ids.has(id)) { release(a); actors.delete(id); }
    },

    step(now, dt, working) {
      for (const a of actors.values()) {
        decide(a, working, now);
        if (a.mode === 'walk') move(a, Math.min(dt, 100), now);
        a.pose = pose(a, now);
      }
      balls = [
        rally('pingpong', 650, 9, 22, '#ffffff', now, 0.12),
        rally('padel', 1100, 34, 0, '#e8f0a0', now, 0.1),
      ].filter(Boolean);
    },

    // What the agent is doing, for the tooltip.
    activity(id, working) {
      const a = actors.get(id);
      if (!a) return '';
      if (a.mode === 'spot') return a.spot.label;
      if (a.mode === 'walk') return a.dest.type === 'desk' ? (working.has(id) ? 'voltando para trabalhar' : 'voltando para a mesa') : a.dest.spot.going;
      return working.has(id) ? 'trabalhando' : 'na mesa';
    },

    // True while someone is moving or playing, so the scene keeps animating.
    busy() { return [...actors.values()].some((a) => a.mode === 'walk' || (a.mode === 'spot' && a.spot.pose === 'play')); },
  };
}
