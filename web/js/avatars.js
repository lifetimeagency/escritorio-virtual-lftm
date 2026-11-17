// Pixel-art avatars (seated, standing and walking), generated from small character maps and cached as sprites.
const PX = 2; // screen pixels per sprite pixel
const OUTLINE = '#262d3d';

// Body parts. Rows are pixels; H hair, S skin, E eyes, m mouth, T shirt, t shirt shade, P pants, K shoes.
const HEAD_FRONT = [
  '...HHHHHHH...',
  '..HHHHHHHHH..',
  '.HHHHHHHHHHH.',
  '.HHHSSSSSHHH.',
  '.HHSSSSSSSHH.',
  '.HSSSSSSSSHH.',
  '.HSESSSESSHH.',
  '.SSSSSSSSSSH.',
  '..SSSSSSSSS..',
  '..SSSmmSSSS..',
  '...SSSSSSS...',
];
const HEAD_BACK = [
  '...HHHHHHH...',
  '..HHHHHHHHH..',
  '.HHHHHHHHHHH.',
  '.HHHHHHHHHHH.',
  '.HHHHHHHHHHH.',
  '.HHHHHHHHHHH.',
  '.HHHHHHHHHHH.',
  '.HHHHHHHHHHH.',
  '..HHHHHHHHH..',
  '..SHHHHHHHS..',
  '...SSSSSSS...',
];
const SEATED_FRONT = [
  '....TTTTT....',
  '..TTTTTTTTT..',
  '.TTTTTTTTTTT.',
  '.TTtTTTTTtTT.',
  '.TTtTTTTTtTT.',
  '.SStTTTTTtSS.',
  '...PPPPPPP...',
  '...PPPPPPP...',
];
const SEATED_BACK = [
  '....TTTTT....',
  '..TTTTTTTTT..',
  '.TTTTTTTTTTT.',
  '.TTtTTTTTtTT.',
  '.TTtTTTTTtTT.',
  '.TTtTTTTTtTT.',
  '...TTTTTTT...',
  '...TTTTTTT...',
];
const STANDING = [ // arms down, hands at the sides
  '....TTTTT....',
  '..TTTTTTTTT..',
  '.TTTTTTTTTTT.',
  '.TtTTTTTTTtT.',
  '.TtTTTTTTTtT.',
  '.TtTTTTTTTtT.',
  '.S.TTTTTTT.S.',
];
const LEGS = {
  stand: ['...PPPPPPP...', '...PPP.PPP...', '...PPP.PPP...', '...PP...PP...', '...KK...KK...'],
  stride: ['...PPPPPPP...', '...PPP.PPP...', '..PPP...PPP..', '..PP.....PP..', '..KK.....KK..'],
};
const POSES = {
  sit: (back) => [...(back ? HEAD_BACK : HEAD_FRONT), ...(back ? SEATED_BACK : SEATED_FRONT)],
  stand: (back) => [...(back ? HEAD_BACK : HEAD_FRONT), ...STANDING, ...LEGS.stand],
  stride: (back) => [...(back ? HEAD_BACK : HEAD_FRONT), ...STANDING, ...LEGS.stride],
};

const SKIN = ['#f6d3b3', '#eebd94', '#d9a070', '#b47a4e', '#8a5a38'];
const HAIR = ['#2b2320', '#4a3324', '#7a4a26', '#c08a3e', '#d9c08a', '#5b3a2e', '#a3402c'];
const SHIRT = ['#0C4546', '#006864', '#118282', '#5fa9a7', '#9ccbc9', '#002740', '#283943', '#C2C3C9', '#ffffff', '#e9eef0'];
const PANTS = ['#283943', '#3d4650', '#002740', '#4c545c'];

const SPECIAL = {
  boss: { skin: SKIN[1], hair: HAIR[0], shirt: '#002740', pants: '#001c2e', style: 0, tie: '#118282' },
  cos: { skin: SKIN[2], hair: HAIR[1], shirt: '#0C4546', pants: '#283943', style: 1, tie: null, collar: true },
};

function rand(seed) { // small deterministic generator
  let s = (seed * 2654435761) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function lookFor(key) {
  if (SPECIAL[key]) return SPECIAL[key];
  const r = rand(Number(key) + 7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), style: Math.floor(r() * 4) };
}

function styled(rows, style, back) {
  const g = rows.map((r) => r.split(''));
  const set = (y, x, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  if (style === 1) { // long hair
    for (let y = 7; y <= 12; y++) { set(y, 1, 'H'); set(y, 11, 'H'); if (back) for (let x = 2; x <= 10; x++) if (y <= 11) set(y, x, 'H'); }
  } else if (style === 2) { // bun
    g.unshift('.....HHH.....'.split(''), '....HHHHH....'.split(''));
  } else if (style === 3 && !back) { // open forehead
    for (let x = 3; x <= 8; x++) set(3, x, 'S');
    set(4, 2, 'S'); set(2, 3, 'H');
  }
  return g;
}

const cache = new Map();

// pose: 'sit' | 'stand' | 'stride' (the second walking frame)
export function sprite(key, back, flip, pose = 'sit') {
  const id = `${key}|${back}|${flip}|${pose}`;
  if (cache.has(id)) return cache.get(id);
  const look = lookFor(key);
  const grid = styled((POSES[pose] || POSES.sit)(back), look.style, back);
  const top = grid.findIndex((r) => r.includes('T')); // first shirt row
  if (!back && look.tie) { for (let y = top; y <= top + 3; y++) grid[y][6] = 'R'; grid[top][5] = 'C'; grid[top][7] = 'C'; }
  if (!back && look.collar) { grid[top][5] = 'C'; grid[top][6] = 'C'; grid[top][7] = 'C'; grid[top + 1][6] = 'C'; }
  const h = grid.length, w = grid[0].length;
  const colors = {
    H: look.hair, S: look.skin, m: '#b5564e', E: '#1d2230', T: look.shirt, t: null, P: look.pants, R: look.tie, C: '#ffffff', K: '#23272e',
  };
  const cv = document.createElement('canvas');
  cv.width = (w + 2) * PX; cv.height = (h + 2) * PX;
  const c = cv.getContext('2d');
  const at = (x, y) => (grid[y] && grid[y][x] && grid[y][x] !== '.' ? grid[y][x] : null);
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const ch = at(x, y);
      let fill = null;
      if (ch) fill = ch === 't' ? darker(look.shirt) : colors[ch];
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) fill = OUTLINE;
      if (!fill) continue;
      const dx = flip ? w - 1 - x : x;
      c.fillStyle = fill;
      c.fillRect((dx + 1) * PX, (y + 1) * PX, PX, PX);
    }
  }
  const out = { canvas: cv, w: cv.width, h: cv.height };
  cache.set(id, out);
  return out;
}

function darker(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * 0.82);
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

// Draws the sprite with its bottom-centre at (sx, sy). facing: 'SW' | 'SE' | 'NE' | 'NW'.
export function drawAvatar(ctx, key, facing, sx, sy, pose = 'sit') {
  const back = facing === 'NE' || facing === 'NW';
  const flip = facing === 'SE' || facing === 'NW';
  const s = sprite(key, back, flip, pose);
  ctx.drawImage(s.canvas, Math.round(sx - s.w / 2), Math.round(sy - s.h));
  return s;
}
