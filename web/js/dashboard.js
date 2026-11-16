// Dashboards: one per area plus the whole agency. Everything is computed from the tasks themselves,
// so the numbers are always live. New blocks are added to BLOCKS; filters above scope every block.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Tudo']];
const STAGES = [
  ['in_production', 'Em produção'], ['in_review', 'Com o CoS'], ['waiting', 'Aguardando você'],
  ['approved', 'Aprovadas'], ['failed', 'Paradas por falha'], ['cancelled', 'Canceladas'],
];
const STATUS_LABEL = { in_production: 'Em produção', in_review: 'Com o CoS', delivered: 'Aguardando você', escalated: 'Escalada pelo CoS', approved: 'Aprovada', failed: 'Falhou', cancelled: 'Cancelada' };
const stageOf = (t) => (t.status === 'delivered' || t.status === 'escalated' ? 'waiting' : t.status);
const DAY = 86400000;

const fmtInt = (n) => n.toLocaleString('pt-BR');
const fmtDec = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function fmtDuration(ms) {
  const min = ms / 60000;
  if (min < 1) return 'menos de 1 min';
  if (min < 90) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${fmtDec(min / 60)} h`;
  return `${fmtDec(min / 1440)} dias`;
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null; };
// Moment a delivery first reached the Big Boss: the first review that approved it or escalated it.
function reachedBossAt(t) {
  if (!['delivered', 'escalated', 'approved'].includes(t.status) && !t.reviews.some((r) => r.approved)) return null;
  const hit = t.reviews.find((r) => r.approved) || (t.status === 'escalated' ? t.reviews[t.reviews.length - 1] : null);
  return hit ? new Date(hit.at).getTime() : null;
}

export function createDashboard({ store, api, openTask }) {
  const root = $('dash'), body = $('dash-body'), tip = $('dash-tip');
  let filter = { areaId: null, period: '30', stage: null };
  let tasks = [];
  let stamp = '';
  let open = false;

  // ---- tooltip (labels are user data: always textContent)
  function showTip(ev, value, label) {
    tip.replaceChildren(el('b', '', value), el('span', '', label));
    tip.hidden = false;
    const r = root.getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${ev.clientY - r.top + 14}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  function hoverable(node, value, label) {
    node.addEventListener('pointermove', (ev) => showTip(ev, value, label));
    node.addEventListener('pointerleave', hideTip);
  }

  // ---- building blocks
  function card(title, note) {
    const c = el('section', 'dcard');
    c.append(el('h3', '', title));
    if (note) c.append(el('p', 'dnote', note));
    return c;
  }
  function tile(label, value, sub) {
    const t = el('div', 'dtile');
    t.append(el('span', 'dlabel', label), el('strong', '', value), el('span', 'dsub', sub || ''));
    return t;
  }
  // Horizontal bars: one hue, value at the tip, the whole row is the hover/click target.
  function bars(rows, { onPick, picked, empty }) {
    const wrap = el('div', 'dbars');
    const max = Math.max(1, ...rows.map((r) => r.value));
    if (!rows.some((r) => r.value)) { wrap.append(el('p', 'dempty', empty)); return wrap; }
    for (const r of rows) {
      const row = el(onPick ? 'button' : 'div', `dbar${picked === r.key ? ' on' : ''}`);
      const name = el('span', 'dname', r.label);
      const track = el('span', 'dtrack');
      const fill = el('span', 'dfill'); fill.style.width = `${(r.value / max) * 100}%`;
      track.append(fill, el('span', 'dval', fmtInt(r.value)));
      row.append(name, track);
      hoverable(row, fmtInt(r.value), r.tip || r.label);
      if (onPick) row.addEventListener('click', () => onPick(r.key));
      wrap.append(row);
    }
    return wrap;
  }
  // Columns over time: one series, baseline at zero, sparse axis labels.
  function columns(buckets, unit) {
    const wrap = el('div', 'dcols');
    const max = Math.max(1, ...buckets.map((b) => b.value));
    const axis = el('div', 'daxis'); axis.append(el('span', '', fmtInt(max)), el('span', '', '0'));
    const plot = el('div', 'dplot');
    buckets.forEach((b) => {
      const col = el('div', 'dcol');
      const bar = el('span', 'dcolbar'); bar.style.height = `${(b.value / max) * 100}%`;
      if (!b.value) bar.classList.add('zero');
      col.append(bar);
      hoverable(col, fmtInt(b.value), `${unit} · ${b.label}`);
      plot.append(col);
    });
    const labels = el('div', 'dxlabels');
    const picks = buckets.length > 2 ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1] : buckets.map((_, i) => i);
    labels.append(...picks.map((i) => el('span', '', buckets[i].label)));
    const right = el('div', 'dright'); right.append(plot, labels);
    wrap.append(axis, right);
    return wrap;
  }

  // ---- data for the current filters
  function scoped() {
    const since = filter.period === 'all' ? 0 : Date.now() - Number(filter.period) * DAY;
    return tasks.filter((t) => (!filter.areaId || t.area_id === filter.areaId) && new Date(t.created_at).getTime() >= since);
  }
  function timeBuckets(list) {
    const days = filter.period === 'all' ? Math.max(7, Math.ceil((Date.now() - Math.min(Date.now(), ...list.map((t) => new Date(t.created_at).getTime()))) / DAY) + 1) : Number(filter.period);
    const size = days > 45 ? 7 : 1; // weekly buckets on long ranges
    const count = Math.min(60, Math.ceil(days / size));
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const buckets = Array.from({ length: count }, (_, i) => {
      const to = end.getTime() - (count - 1 - i) * size * DAY, from = to - size * DAY;
      return { from, to, value: 0, label: size === 1 ? fmt(new Date(to)) : `semana de ${fmt(new Date(from + 1))}` };
    });
    for (const t of list) {
      const at = reachedBossAt(t);
      const b = at && buckets.find((x) => at > x.from && at <= x.to);
      if (b) b.value += 1;
    }
    return { buckets, unit: 'Entregas que chegaram a você' };
  }

  // ---- blocks (add new ones here)
  const BLOCKS = [
    function summary(list) {
      const reviewed = list.filter((t) => t.reviews.length);
      const firstPass = reviewed.filter((t) => t.reviews[0].approved).length;
      const reached = list.filter((t) => reachedBossAt(t) !== null);
      const rounds = reached.length ? reached.reduce((n, t) => n + t.reviews.length, 0) / reached.length : null;
      const lead = median(reached.map((t) => reachedBossAt(t) - new Date(t.created_at).getTime()));
      const row = el('div', 'dtiles');
      row.append(
        tile('Tarefas delegadas', fmtInt(list.length), 'no período'),
        tile('Aprovadas por você', fmtInt(list.filter((t) => t.status === 'approved').length), `${fmtInt(list.filter((t) => ['delivered', 'escalated'].includes(t.status)).length)} aguardando sua decisão`),
        tile('Aprovadas de primeira pelo CoS', reviewed.length ? `${Math.round((firstPass / reviewed.length) * 100)}%` : '—', reviewed.length ? `${fmtInt(firstPass)} de ${fmtInt(reviewed.length)} ${reviewed.length === 1 ? 'entrega avaliada' : 'entregas avaliadas'}` : 'nenhuma entrega avaliada ainda'),
        tile('Rodadas no CoS por entrega', rounds === null ? '—' : fmtDec(rounds), 'média até chegar a você'),
        tile('Tempo até chegar a você', lead === null ? '—' : fmtDuration(lead), 'mediana, da delegação à entrega'),
      );
      return row;
    },
    function flow(list) {
      const c = card('Onde estão as tarefas', 'Clique em uma etapa para filtrar a lista abaixo.');
      const rows = STAGES.map(([key, label]) => ({ key, label, value: list.filter((t) => stageOf(t) === key).length })).filter((r) => r.value || !['failed', 'cancelled'].includes(r.key));
      c.append(bars(rows, { picked: filter.stage, onPick: (key) => { filter.stage = filter.stage === key ? null : key; paint(); }, empty: 'Nenhuma tarefa neste período.' }));
      return c;
    },
    function deliveries(list) {
      const c = card('Entregas que chegaram a você', 'Entregas que passaram pelo CoS, pela data em que chegaram.');
      const { buckets, unit } = timeBuckets(list);
      c.append(columns(buckets, unit));
      return c;
    },
    function standards(list) {
      const c = card('Padrões que mais devolvem entregas', 'Quantas vezes o CoS reprovou cada padrão de qualidade.');
      const counts = new Map();
      for (const t of list) for (const r of t.reviews) for (const k of r.criteria) if (!k.passed) counts.set(k.criterion, (counts.get(k.criterion) || 0) + 1);
      const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, value]) => ({ key: text, label: text, tip: text, value }));
      c.append(bars(rows, { empty: 'Nenhuma devolução do CoS neste período.' }));
      return c;
    },
    function people(list) {
      if (!filter.areaId) {
        const c = card('Tarefas por área', 'Clique em uma área para abrir o dashboard dela.');
        const rows = store.state.areas.filter((a) => a.name).map((a) => ({ key: a.id, label: a.name, value: list.filter((t) => t.area_id === a.id).length }));
        c.append(bars(rows, { onPick: (id) => { filter = { ...filter, areaId: id, stage: null }; paint(); }, empty: 'Nenhuma tarefa delegada neste período.' }));
        return c;
      }
      const c = card('Participação do time', 'Em quantas tarefas cada agente entregou uma parte.');
      const counts = new Map();
      for (const t of list) for (const k of t.contributions) counts.set(k.agent_name, (counts.get(k.agent_name) || 0) + 1);
      const rows = [...counts].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ key: name, label: name, value }));
      c.append(bars(rows, { empty: 'O time ainda não participou de tarefas neste período.' }));
      return c;
    },
    function table(list) {
      const shown = filter.stage ? list.filter((t) => stageOf(t) === filter.stage) : list;
      const stage = STAGES.find(([k]) => k === filter.stage);
      const c = card(stage ? `Tarefas · ${stage[1]}` : 'Tarefas', '');
      c.classList.add('wide');
      if (stage) { const clear = el('button', 'link', 'Mostrar todas'); clear.addEventListener('click', () => { filter.stage = null; paint(); }); c.querySelector('h3').append(' ', clear); }
      if (!shown.length) { c.append(el('p', 'dempty', 'Nenhuma tarefa para mostrar com estes filtros.')); return c; }
      const tbl = el('table', 'dtable');
      const head = el('tr'); for (const h of ['Tarefa', 'Área', 'Situação', 'Rodadas no CoS', 'Delegada em']) head.append(el('th', '', h));
      tbl.append(head);
      const areaName = (id) => store.state.areas.find((a) => a.id === id)?.name || `Mesa ${id}`;
      for (const t of [...shown].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 100)) {
        const tr = el('tr'); tr.tabIndex = 0;
        tr.append(el('td', 'dtitle', t.title), el('td', '', areaName(t.area_id)), el('td', '', STATUS_LABEL[t.status]), el('td', 'num', fmtInt(t.reviews.length)),
          el('td', 'num', new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })));
        const go = () => { close(); openTask(t.id); };
        tr.addEventListener('click', go); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
        tbl.append(tr);
      }
      const scroller = el('div', 'dscroll'); scroller.append(tbl);
      c.append(scroller);
      return c;
    },
  ];

  // ---- rendering
  function segmented(items, current, onPick) {
    const seg = el('div', 'dseg');
    for (const [value, label] of items) {
      const b = el('button', value === current ? 'on' : '', label);
      b.addEventListener('click', () => onPick(value));
      seg.append(b);
    }
    return seg;
  }
  function paint() {
    hideTip();
    const areas = store.state.areas.filter((a) => a.name);
    if (filter.areaId && !areas.some((a) => a.id === filter.areaId)) filter.areaId = null;
    $('dash-title').textContent = filter.areaId ? `Dashboard · ${areas.find((a) => a.id === filter.areaId).name}` : 'Dashboard · Agência';
    const filters = el('div', 'dfilters');
    filters.append(
      segmented(PERIODS, filter.period, (p) => { filter.period = p; paint(); }),
      segmented([[null, 'Agência'], ...areas.map((a) => [a.id, a.name])], filter.areaId, (id) => { filter = { ...filter, areaId: id, stage: null }; paint(); }),
    );
    const list = scoped();
    const grid = el('div', 'dgrid');
    const [summary, ...rest] = BLOCKS.map((block) => block(list));
    grid.append(...rest);
    const scroll = body.scrollTop;
    body.replaceChildren(filters, summary, grid);
    body.scrollTop = scroll;
  }

  async function refresh() {
    if (!open) return;
    const next = store.state.tasks.map((t) => t.id + t.updated_at).join('|') + store.state.areas.map((a) => a.name).join('|');
    if (next === stamp) return;
    stamp = next;
    try { tasks = await api.tasks(); } catch { return; }
    if (open) paint();
  }

  function show(areaId) {
    const defined = store.state.areas.some((a) => a.id === areaId && a.name);
    filter = { areaId: defined ? areaId : null, period: filter.period, stage: null };
    open = true; stamp = ''; root.hidden = false;
    paint();
    refresh();
  }
  function close() { open = false; root.hidden = true; hideTip(); }

  $('dash-close').addEventListener('click', close);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) close(); });
  return { show, close, refresh };
}
