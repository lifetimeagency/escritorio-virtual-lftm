// Side panel: every action the Big Boss takes happens here (delegate, hire, set standards, approve).
import { api } from './api.js';
import { sprite } from './avatars.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS = {
  in_production: ['Em produção', 'prod'], in_review: ['Com o CoS', 'review'], delivered: ['Aguardando você', 'deliv'],
  escalated: ['Escalada pelo CoS', 'esc'], approved: ['Aprovada', 'ok'], failed: ['Falhou', 'fail'], cancelled: ['Cancelada', ''],
};
const STAGE = {
  planning: 'Head distribuindo a tarefa', executing: 'Time produzindo', consolidating: 'Head fechando a entrega',
  revising: 'Head ajustando a entrega', reviewing: 'CoS avaliando',
};
export const AWAITING = ['delivered', 'escalated'];
const CHANNELS = { linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook' };
const PUB_STATUS = {
  scheduled: ['Agendada', 'review'], ready: ['Pronta para publicar', 'deliv'], published: ['Publicada', 'ok'],
  failed: ['Falhou', 'fail'], cancelled: ['Cancelada', ''],
};
const PUB_ATTENTION = ['ready', 'failed'];
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function nextHourInput() { // value for <input type="datetime-local">, in the viewer's time zone
  const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Social posts are plain text: drop the Markdown marks the deliverable may carry.
function plain(src) {
  return String(src || '').replace(/\r/g, '')
    .replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)').replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function ago(isoDate) {
  const s = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

// Minimal, safe Markdown: everything is escaped first, then a small set of constructs is rebuilt.
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function md(src) {
  const out = [];
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let i = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre>${esc(buf.join('\n'))}</pre>`); continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const list = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (list) {
      const ordered = /\d/.test(list[1]); const buf = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
        if (!m) break; buf.push(`<li>${inline(m[2])}</li>`); i++;
      }
      out.push(ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`); continue;
    }
    if (/^\s*>/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^\s*>\s?/, ''))}</blockquote>`); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s|\s*>|\s*\|)/.test(lines[i])) buf.push(inline(lines[i++]));
    if (buf.length) out.push(`<p>${buf.join('<br>')}</p>`); else { out.push(`<p>${inline(l)}</p>`); i++; }
  }
  return out.join('');
}

export function createUI({ store, reload, onChange, openDashboard }) {
  const drawer = $('drawer'), body = $('drawer-body');
  let panel = null;      // current view descriptor
  let lastHtml = '';
  let dirty = false;     // a form has unsaved typing: do not re-render on background refresh
  const tasks = {};      // full task cache: id -> { stamp, data }

  // ---- lookups
  const st = () => store.state;
  const area = (id) => st().areas.find((a) => a.id === id);
  const headOf = (id) => st().agents.find((a) => a.area_id === id && a.kind === 'head');
  const teamOf = (id) => st().agents.filter((a) => a.area_id === id && a.kind === 'member').sort((a, b) => a.seat - b.seat);
  const agent = (id) => st().agents.find((a) => a.id === id);
  const awaiting = () => st().tasks.filter((t) => AWAITING.includes(t.status));

  function toast(msg, isError) {
    const el = $('toast'); el.textContent = msg; el.className = `toast${isError ? ' err' : ''}`; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2600);
  }

  // ---- fragments
  const chip = (t) => `<span class="chip ${STATUS[t.status][1]}">${STATUS[t.status][0]}</span>`;
  function taskItem(t) {
    const where = t.status === 'in_production' || t.status === 'in_review' ? (STAGE[t.activity?.stage] || '') : '';
    const round = t.review_round > 1 && t.status !== 'approved' ? ` · rodada ${t.review_round}` : '';
    const sub = [area(t.area_id)?.name, where + (where ? round : ''), ago(t.updated_at)].filter(Boolean).join(' · ');
    return `<button class="item" data-act="task" data-id="${t.id}"><div class="t"><span>${esc(t.title)}</span>${chip(t)}</div><div class="s">${esc(sub)}</div></button>`;
  }
  const taskList = (list, empty) => (list.length ? `<div class="list">${list.map(taskItem).join('')}</div>` : `<div class="empty">${empty}</div>`);
  const tabs = (items, on) => `<div class="tabs">${items.map(([id, label]) => `<button data-act="tab" data-tab="${id}" class="${id === on ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  const field = (label, name, value = '', hint = '') => `<label>${label}${hint ? ` <span>${hint}</span>` : ''}<input type="text" name="${name}" value="${esc(value)}" autocomplete="off"></label>`;
  const area_ = (label, name, value, rows, placeholder, hint = '') => `<label>${label}${hint ? ` <span>${hint}</span>` : ''}<textarea name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  function who(a) {
    return `<div class="who"><div class="av" data-look="${a.look}"></div><div><b>${esc(a.name)}</b><span>${esc(a.role)}</span></div></div>`;
  }

  const externalDash = (a) => /^https:\/\//.test(a?.dashboard_url || '');
  const pubChip = (p) => `<span class="chip ${PUB_STATUS[p.status][1]}">${PUB_STATUS[p.status][0]}</span>`;
  const pubItem = (p, sub) => `<button class="item" data-act="pub" data-id="${p.id}"><div class="t"><span>${CHANNELS[p.channel]} · ${esc(when(p.scheduled_at))}</span>${pubChip(p)}</div><div class="s">${esc(sub ?? p.task_title)}</div></button>`;
  const noAccounts = () => !(st().social?.connected || []).length;
  function publishBlock(t) {
    const pubs = (st().publications || []).filter((p) => p.task_id === t.id);
    const note = noAccounts()
      ? 'Nenhuma conta de rede social está conectada ainda. No horário marcado, a publicação aparece em Publicações como pronta, com o texto para copiar, e você marca quando publicar.'
      : 'Redes conectadas publicam sozinhas no horário marcado.';
    return `<h3>Publicação nas redes</h3>
      ${pubs.length ? `<div class="list">${pubs.map((p) => pubItem(p, p.status === 'published' && p.published_at ? `Publicada em ${when(p.published_at)}` : '')).join('')}</div>` : ''}
      <details data-key="publish" ${pubs.length ? '' : 'open'}><summary>Agendar publicação</summary><div class="in"><form data-form="publish">
        <label>Rede<select name="channel">${Object.entries(CHANNELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>Data e hora<input type="datetime-local" name="when" value="${nextHourInput()}"></label>
        ${area_('Texto da publicação', 'text', plain(t.deliverable), 9, 'Texto que vai para a rede')}
        <p class="note">${note} O Instagram só aceita publicações com imagem.</p>
        <button class="btn primary block">Agendar publicação</button></form></div></details>`;
  }

  // ---- views
  const views = {
    pubs() {
      const all = st().publications || [];
      const groups = { ready: all.filter((p) => PUB_ATTENTION.includes(p.status)), scheduled: all.filter((p) => p.status === 'scheduled'), published: all.filter((p) => p.status === 'published').reverse() };
      let html = tabs([['ready', `Prontas${groups.ready.length ? ` (${groups.ready.length})` : ''}`], ['scheduled', 'Agendadas'], ['published', 'Publicadas']], panel.tab);
      const empty = {
        ready: 'Nada esperando para ser publicado.',
        scheduled: 'Nenhuma publicação agendada.<br>Agende a partir de uma entrega aprovada.',
        published: 'Nenhuma publicação feita ainda.',
      }[panel.tab];
      const list = groups[panel.tab];
      html += list.length ? `<div class="list">${list.map((p) => pubItem(p)).join('')}</div>` : `<div class="empty">${empty}</div>`;
      return { title: 'Publicações', sub: 'Entregas aprovadas agendadas para as redes sociais', html };
    },

    pub() {
      const p = (st().publications || []).find((x) => x.id === panel.pubId);
      if (!p) return { title: 'Publicação', sub: '', html: '<div class="empty">Publicação não encontrada.</div>' };
      const link = /^https?:\/\//.test(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>` : esc(p.url);
      const markForm = `<form data-form="published">${field('Link da publicação', 'url', '', '(opcional)')}<div class="row-actions"><button class="btn primary">Marcar como publicada</button></div></form>`;
      const status = {
        scheduled: `<div class="callout info"><p>Agendada para <b>${esc(when(p.scheduled_at))}</b>. ${noAccounts() ? 'No horário, ela vai para as prontas para você publicar.' : 'Ela será publicada automaticamente no horário.'}</p><button class="link muted" data-act="pub-cancel">Cancelar publicação</button></div>`,
        ready: `<div class="callout ok"><p><b>Chegou a hora.</b> Copie o texto, publique no ${CHANNELS[p.channel]} e marque aqui.</p>${markForm}<button class="link muted" data-act="pub-cancel">Cancelar publicação</button></div>`,
        failed: `<div class="callout bad"><p><b>A publicação falhou.</b> ${esc(p.error)}</p><div class="row-actions"><button class="btn primary" data-act="pub-retry">Tentar de novo</button><button class="btn danger" data-act="pub-cancel">Cancelar</button></div></div>`,
        published: `<div class="callout ok"><p>Publicada${p.published_at ? ` em ${esc(when(p.published_at))}` : ''}.</p>${p.url ? `<p>${link}</p>` : ''}</div>`,
        cancelled: '<div class="callout">Publicação cancelada.</div>',
      }[p.status];
      const html = `${status}
        <div class="head-row"><h3>Texto</h3><button class="link" data-act="pub-copy">Copiar</button></div>
        <div class="doc pre">${esc(p.text)}</div>
        <div class="row-actions" style="margin-top:12px"><button class="btn" data-act="task" data-id="${p.task_id}">Ver a entrega</button></div>`;
      return { title: `${CHANNELS[p.channel]} · ${when(p.scheduled_at)}`, sub: `${p.task_title} · ${PUB_STATUS[p.status][0]}`, html };
    },

    boss() {
      const waiting = awaiting();
      let html = tabs([['delegate', 'Delegar'], ['inbox', `Entregas${waiting.length ? ` (${waiting.length})` : ''}`], ['all', 'Todas']], panel.tab);
      if (panel.tab === 'delegate') {
        const defined = st().areas.filter((a) => a.name);
        if (!defined.length) {
          html += '<div class="empty">Nenhuma área definida ainda.<br>Clique na ponta de uma mesa para dar nome à área e sentar o Head que vai receber as tarefas.</div>';
        } else {
          const pre = panel.areaId || defined[0].id;
          html += `<form data-form="delegate">
            <label>Área responsável<select name="area_id">${defined.map((a) => `<option value="${a.id}" ${a.id === pre ? 'selected' : ''}>${esc(a.name)} — ${esc(headOf(a.id)?.name || '')}</option>`).join('')}</select></label>
            ${field('Título', 'title')}
            ${area_('Briefing', 'briefing', '', 10, 'Objetivo, público, formato esperado, tom, referências, restrições…')}
            <p class="note">O Head distribui para o time, fecha a entrega e envia ao CoS. Você só recebe o que passar nos padrões de qualidade. Não inclua dados pessoais de clientes no briefing.</p>
            <button class="btn primary block">Delegar para a área</button></form>`;
        }
      } else if (panel.tab === 'inbox') {
        html += taskList(waiting, 'Nada aguardando você.<br>O CoS só encaminha o que passou nos padrões de qualidade.');
      } else {
        html += taskList(st().tasks, 'Nenhuma tarefa delegada ainda.');
      }
      return { title: 'Sala do Big Boss', sub: 'Delegue tarefas e receba as entregas aprovadas pelo CoS', html };
    },

    cos() {
      const s = st().settings;
      let html = tabs([['standards', 'Padrões de qualidade'], ['reviews', 'Revisões']], panel.tab);
      if (panel.tab === 'standards') {
        html += `<p class="lead">O CoS confere toda entrega contra estes padrões antes de ela chegar a você. Se um deles não for cumprido, a entrega volta para o Head com os ajustes exigidos.</p>
          <form data-form="settings">
            ${area_('Padrões', 'standards', s.standards.join('\n'), 11, 'Um padrão por linha', '(um por linha)')}
            <label>Rodadas de revisão <span>(depois disso o CoS escala a decisão para você)</span><input type="number" name="max_review_rounds" min="1" max="10" value="${s.max_review_rounds}"></label>
            <button class="btn primary block">Salvar padrões</button></form>`;
      } else {
        const reviewed = st().tasks.filter((t) => t.last_review || t.status === 'in_review');
        html += reviewed.length ? `<div class="list">${reviewed.map((t) => {
          const verdict = t.status === 'in_review' ? 'Em avaliação agora' : `${t.last_review.approved ? 'Aprovou' : 'Devolveu'}: ${t.last_review.summary}`;
          return `<button class="item" data-act="task" data-id="${t.id}"><div class="t"><span>${esc(t.title)}</span>${chip(t)}</div><div class="s">${esc(verdict)}</div></button>`;
        }).join('')}</div>` : '<div class="empty">Nenhuma entrega passou pelo CoS ainda.</div>';
      }
      return { title: 'Chief of Staff', sub: 'Filtro de qualidade entre as áreas e você', html };
    },

    area() {
      const a = area(panel.areaId), head = headOf(a.id);
      const form = `<form data-form="area">
        ${field('Nome da área', 'name', a.name, '(ex.: Conteúdo, Social Media, Mídia Paga)')}
        ${field('Nome do Head', 'head_name', head?.name || '')}
        ${area_('Instruções do Head', 'head_instructions', head?.instructions || '', 6, 'Como ele conduz a área, o que prioriza, o que a área entrega…', '(opcional)')}
        ${field('Link do dashboard da área', 'dashboard_url', a.dashboard_url || '', '(opcional, https://…)')}
        <p class="note">Se a área já tem um dashboard próprio, cole o link: a tela da mesa passa a abri-lo.</p>
        <button class="btn primary block">${a.name ? 'Salvar' : 'Definir área e sentar o Head'}</button></form>`;
      if (!a.name) {
        return { title: `Mesa ${a.id}`, sub: 'Área ainda não definida', html: `<p class="lead">Dê um nome à área e defina o Head que senta na ponta da mesa. É ele quem recebe as suas tarefas, coordena o time e fala com o CoS.</p>${form}` };
      }
      const team = teamOf(a.id);
      const taken = new Set(team.map((m) => m.seat));
      const free = []; for (let s = 1; s <= st().seats_per_area; s++) if (!taken.has(s)) free.push(s);
      const mine = st().tasks.filter((t) => t.area_id === a.id);
      const html = `${who(head)}
        <div class="row-actions"><button class="btn primary" data-act="delegate-to" data-id="${a.id}">Delegar tarefa</button>
        <button class="btn" data-act="hire-at" data-area="${a.id}" data-seat="${free[0] || ''}" ${free.length ? '' : 'disabled'}>Contratar agente</button></div>
        <div class="row-actions" style="margin-top:8px">${externalDash(a)
          ? `<a class="btn" href="${esc(a.dashboard_url)}" target="_blank" rel="noopener noreferrer">Abrir dashboard da área ↗</a><button class="btn" data-act="dash" data-id="${a.id}">Indicadores no escritório</button>`
          : `<button class="btn" data-act="dash" data-id="${a.id}">Abrir dashboard da área</button>`}</div>
        <h3>Time (${team.length}/${st().seats_per_area})</h3>
        ${team.length ? `<div class="list">${team.map((m) => `<button class="item" data-act="agent" data-id="${m.id}"><div class="t"><span>${esc(m.name)}</span>${store.working.has(m.id) ? '<span class="chip prod">Trabalhando</span>' : ''}</div><div class="s">${esc(m.role)}</div></button>`).join('')}</div>` : '<div class="empty">Sem agentes ainda. O Head produz sozinho até você contratar o time.</div>'}
        <h3>Tarefas da área</h3>${taskList(mine, 'Nenhuma tarefa para esta área.')}
        <details data-key="edit-area"><summary>Editar área e Head</summary><div class="in">${form}</div></details>`;
      return { title: a.name, sub: `Mesa ${a.id} · Head: ${head.name}`, html };
    },

    hire() {
      const a = area(panel.areaId);
      const html = `<p class="lead">O agente senta nesta cadeira e passa a receber do Head ${esc(headOf(a.id)?.name || '')} a parte dele em cada tarefa da área.</p>
        <form data-form="hire">
          ${field('Nome', 'name')}
          ${field('Cargo', 'role', '', '(ex.: Redator, Designer, Analista de mídia)')}
          ${area_('Instruções', 'instructions', '', 8, 'O que esse agente faz, como escreve, o que deve e não deve entregar…', '(opcional)')}
          <button class="btn primary block">Contratar</button></form>`;
      return { title: 'Contratar agente', sub: `${a.name} · lugar ${panel.seat}`, html };
    },

    agent() {
      const a = agent(panel.agentId);
      if (!a) return { title: 'Agente', sub: '', html: '<div class="empty">Este agente não está mais no escritório.</div>' };
      const busy = st().tasks.find((t) => t.activity?.agent_ids.includes(a.id));
      const html = `${who(a)}
        <div class="callout ${busy ? 'info' : ''}">${busy ? `Trabalhando em <button class="link" data-act="task" data-id="${busy.id}">${esc(busy.title)}</button>` : 'Livre no momento.'}</div>
        <form data-form="agent">
          ${field('Nome', 'name', a.name)}
          ${field('Cargo', 'role', a.role)}
          ${area_('Instruções', 'instructions', a.instructions, 8, 'O que esse agente faz, como escreve, o que deve e não deve entregar…')}
          <button class="btn primary block">Salvar</button></form>
        <div class="row-actions" style="margin-top:10px"><button class="btn danger" data-act="dismiss" data-id="${a.id}">${panel.confirm ? 'Confirmar desligamento' : 'Desligar agente'}</button></div>`;
      return { title: a.name, sub: `${area(a.area_id).name} · lugar ${a.seat}`, html };
    },

    task() {
      const summary = st().tasks.find((t) => t.id === panel.taskId);
      const t = tasks[panel.taskId]?.data;
      if (!summary || !t) return { title: 'Tarefa', sub: '', html: '<div class="empty">Carregando…</div>' };
      const a = area(t.area_id), head = headOf(t.area_id);
      const pos = { in_production: 1, in_review: 2, delivered: 3, escalated: 3, approved: 4 }[t.status] ?? ({ in_review: 2 }[t.failed_from] ?? 1);
      const steps = ['Big Boss', a?.name || 'Área', 'CoS', 'Big Boss'];
      const pipeline = `<div class="pipeline">${steps.map((s, i) => `<div class="step ${i < pos ? 'done' : i === pos ? (t.status === 'failed' ? 'err' : t.status === 'cancelled' ? '' : 'now') : ''}">${esc(s)}</div>`).join('<i>›</i>')}</div>`;

      let action = '';
      if (AWAITING.includes(t.status)) {
        const escalated = t.status === 'escalated';
        action = `<div class="callout ${escalated ? 'bad' : 'ok'}"><p>${escalated ? `O CoS reprovou esta entrega ${t.review_round} vezes e escalou a decisão para você.` : 'O CoS conferiu e aprovou esta entrega. Falta a sua decisão.'}</p>
          ${panel.asking ? `<form data-form="changes">${area_('O que a área deve ajustar', 'feedback', '', 5, 'Seja específico: o que mudar e por quê.')}<div class="row-actions"><button class="btn primary">Devolver para a área</button><button type="button" class="btn" data-act="ask-off">Voltar</button></div></form>`
            : `<div class="row-actions"><button class="btn primary" data-act="approve">Aprovar</button><button class="btn" data-act="ask-on">Pedir ajustes</button></div>`}</div>`;
      } else if (t.status === 'failed') {
        action = `<div class="callout bad"><p><b>A execução parou.</b> ${esc(t.error)}</p><div class="row-actions"><button class="btn primary" data-act="retry">Tentar novamente</button><button class="btn danger" data-act="cancel">Cancelar tarefa</button></div></div>`;
      } else if (t.status === 'in_production' || t.status === 'in_review') {
        const names = (t.activity?.agent_ids || []).map((id) => (id === 'cos' ? 'CoS' : agent(id)?.name)).filter(Boolean).join(', ');
        action = `<div class="callout info"><p><b>${STAGE[t.activity?.stage] || 'Na fila'}</b>${names ? ` — ${esc(names)}` : ''}${t.review_round > 1 ? ` · rodada ${t.review_round}` : ''}</p><button class="link muted" data-act="cancel">Cancelar tarefa</button></div>`;
      } else if (t.status === 'approved') {
        action = `<div class="callout ok">Entrega aprovada por você.</div>${publishBlock(t)}`;
      }

      const review = (r) => `<p><b>${r.approved ? 'Aprovada' : 'Devolvida'}</b> — ${esc(r.summary)}</p>
        <ul class="criteria">${r.criteria.map((c) => `<li><span class="m ${c.passed ? 'y' : 'n'}">${c.passed ? '✓' : '✕'}</span><div>${esc(c.criterion)}<small>${esc(c.comment)}</small></div></li>`).join('')}</ul>
        ${r.required_changes.length ? `<p style="margin-top:10px"><b>Ajustes exigidos</b></p><ul>${r.required_changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;
      const last = t.reviews[t.reviews.length - 1];
      const earlier = t.reviews.slice(0, -1);

      const html = `${pipeline}${action}
        ${t.deliverable ? `<div class="head-row"><h3>Entrega${t.status === 'in_production' && t.reviews.length ? ' (versão anterior)' : ''}</h3><button class="link" data-act="copy">Copiar</button></div><div class="doc">${md(t.deliverable)}</div>` : ''}
        ${last ? `<h3>Parecer do CoS · rodada ${last.round}</h3><div class="callout ${last.approved ? 'ok' : 'bad'}">${review(last)}</div>` : ''}
        ${earlier.length ? `<details data-key="earlier"><summary>Pareceres anteriores (${earlier.length})</summary><div class="in">${earlier.map((r) => `<h3>Rodada ${r.round}</h3>${review(r)}`).join('')}</div></details>` : ''}
        <details data-key="briefing"><summary>Briefing</summary><div class="in pre">${esc(t.briefing)}</div></details>
        ${t.contributions.length ? `<details data-key="contrib"><summary>Contribuições do time (${t.contributions.length})</summary><div class="in">${t.contributions.map((c) => `<h3>${esc(c.agent_name)}</h3><p class="note">${esc(c.instruction)}</p><div class="doc">${md(c.output)}</div>`).join('')}</div></details>` : ''}
        <details data-key="history"><summary>Histórico</summary><div class="in"><ul class="timeline">${t.events.map((e) => `<li><time>${new Date(e.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>${esc(e.message)}</li>`).join('')}</ul></div></details>`;
      return { title: t.title, sub: `${a?.name || ''}${head ? ` · Head: ${head.name}` : ''} · ${STATUS[t.status][0]}`, html };
    },
  };

  // ---- rendering
  function paint(force) {
    if (!panel || !st()) return;
    if (!force && dirty) return;
    const v = views[panel.view]();
    $('drawer-title').textContent = v.title; $('drawer-sub').textContent = v.sub;
    if (v.html === lastHtml && !force) return;
    const open = [...body.querySelectorAll('details[open]')].map((d) => d.dataset.key);
    const scroll = force ? 0 : body.scrollTop;
    body.innerHTML = v.html; lastHtml = v.html; dirty = false;
    for (const d of body.querySelectorAll('details')) if (!force && open.includes(d.dataset.key)) d.open = true;
    for (const el of body.querySelectorAll('.av[data-look]')) {
      const s = sprite(el.dataset.look, false, false);
      const c = document.createElement('canvas'); c.width = s.w; c.height = 30; c.getContext('2d').drawImage(s.canvas, 0, 0);
      el.appendChild(c);
    }
    body.scrollTop = scroll;
  }

  async function loadTask(id, stamp) {
    if (tasks[id]?.stamp === stamp) return;
    try { tasks[id] = { stamp, data: await api.task(id) }; if (panel?.taskId === id) paint(false); } catch { /* next refresh retries */ }
  }

  function open(next) {
    const wasHidden = drawer.hidden;
    panel = next; dirty = false; drawer.hidden = false;
    store.selected = { boss: { type: 'room', room: 'boss' }, cos: { type: 'room', room: 'cos' }, area: { type: 'area', areaId: next.areaId }, hire: { type: 'seat', areaId: next.areaId, seat: next.seat }, agent: { type: 'agent', agentId: next.agentId } }[next.view] || null;
    if (next.view === 'task') { const s = st().tasks.find((t) => t.id === next.taskId); loadTask(next.taskId, s?.updated_at); }
    paint(true);
    onChange(wasHidden);
    const first = body.querySelector('form input[type=text]');
    if (first && !first.value && window.matchMedia('(min-width: 861px)').matches) first.focus();
  }

  function close() { panel = null; drawer.hidden = true; store.selected = null; onChange(true); }

  function openTarget(target) {
    if (target.type === 'room') return open(target.room === 'boss' ? { view: 'boss', tab: awaiting().length ? 'inbox' : 'delegate' } : { view: 'cos', tab: 'standards' });
    if (target.type === 'dash') return openDashboard(target.areaId);
    if (target.type === 'area') return open({ view: 'area', areaId: target.areaId });
    if (target.type === 'agent') return open({ view: 'agent', agentId: target.agentId });
    if (target.type === 'seat') return open(area(target.areaId).name ? { view: 'hire', areaId: target.areaId, seat: target.seat } : { view: 'area', areaId: target.areaId });
  }

  async function run(fn, okMsg) {
    try { const r = await fn(); await reload(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); return undefined; }
  }

  // ---- events
  body.addEventListener('input', () => { dirty = true; });
  body.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const d = el.dataset, id = panel.taskId;
    if (d.act === 'tab') open({ ...panel, tab: d.tab });
    else if (d.act === 'task') open({ view: 'task', taskId: d.id });
    else if (d.act === 'agent') open({ view: 'agent', agentId: d.id });
    else if (d.act === 'delegate-to') open({ view: 'boss', tab: 'delegate', areaId: Number(d.id) });
    else if (d.act === 'dash') openDashboard(Number(d.id));
    else if (d.act === 'pub') open({ view: 'pub', pubId: d.id });
    else if (d.act === 'pub-cancel') await run(() => api.cancelPublication(panel.pubId), 'Publicação cancelada.');
    else if (d.act === 'pub-retry') await run(() => api.retryPublication(panel.pubId), 'Publicação reagendada para agora.');
    else if (d.act === 'pub-copy') {
      const p = st().publications.find((x) => x.id === panel.pubId);
      try { await navigator.clipboard.writeText(p.text); toast('Texto copiado.'); } catch { toast('Não foi possível copiar aqui. Selecione o texto e copie.', true); }
    }
    else if (d.act === 'hire-at') open({ view: 'hire', areaId: Number(d.area), seat: Number(d.seat) });
    else if (d.act === 'ask-on') { panel.asking = true; paint(true); body.querySelector('textarea')?.focus(); }
    else if (d.act === 'ask-off') { panel.asking = false; paint(true); }
    else if (d.act === 'approve') await run(() => api.approve(id), 'Entrega aprovada.');
    else if (d.act === 'retry') await run(() => api.retry(id));
    else if (d.act === 'cancel') await run(() => api.cancel(id), 'Tarefa cancelada.');
    else if (d.act === 'copy') { try { await navigator.clipboard.writeText(tasks[id].data.deliverable); toast('Entrega copiada.'); } catch { toast('Não foi possível copiar aqui. Selecione o texto da entrega e copie.', true); } }
    else if (d.act === 'dismiss') {
      if (!panel.confirm) { panel.confirm = true; paint(true); return; }
      const a = agent(d.id);
      if (await run(() => api.dismiss(d.id).then(() => true), 'Agente desligado.')) open({ view: 'area', areaId: a.area_id });
    }
  });
  body.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target).entries());
    const kind = ev.target.dataset.form;
    const btn = ev.target.querySelector('button.primary'); btn.disabled = true;
    if (kind === 'delegate') {
      const t = await run(() => api.delegate({ title: f.title, briefing: f.briefing, area_id: Number(f.area_id) }), 'Tarefa delegada.');
      if (t) open({ view: 'task', taskId: t.id });
    } else if (kind === 'settings') {
      if (await run(() => api.saveSettings({ standards: f.standards.split('\n'), max_review_rounds: Number(f.max_review_rounds) }), 'Padrões salvos.')) { dirty = false; paint(true); }
    } else if (kind === 'area') {
      if (await run(() => api.defineArea(panel.areaId, f), 'Área salva.')) open({ view: 'area', areaId: panel.areaId });
    } else if (kind === 'hire') {
      const a = await run(() => api.hire({ ...f, area_id: panel.areaId, seat: panel.seat }), 'Agente contratado.');
      if (a) open({ view: 'area', areaId: panel.areaId });
    } else if (kind === 'agent') {
      if (await run(() => api.updateAgent(panel.agentId, f), 'Agente atualizado.')) { dirty = false; paint(true); }
    } else if (kind === 'publish') {
      const moment = f.when ? new Date(f.when) : null;
      if (!moment || Number.isNaN(moment.getTime())) toast('Informe a data e a hora da publicação.', true);
      else {
        const p = await run(() => api.schedulePublication({ task_id: panel.taskId, channel: f.channel, text: f.text, scheduled_at: moment.toISOString() }), 'Publicação agendada.');
        if (p) { dirty = false; paint(true); }
      }
    } else if (kind === 'published') {
      if (await run(() => api.markPublished(panel.pubId, f.url), 'Marcada como publicada.')) { dirty = false; paint(true); }
    } else if (kind === 'changes') {
      if (await run(() => api.requestChanges(panel.taskId, f.feedback), 'Devolvida para a área.')) { panel.asking = false; dirty = false; paint(true); }
    }
    btn.disabled = false;
  });
  $('drawer-close').addEventListener('click', close);
  $('btn-delegate').addEventListener('click', () => open({ view: 'boss', tab: 'delegate' }));
  $('btn-inbox').addEventListener('click', () => open({ view: 'boss', tab: 'inbox' }));
  $('btn-dash').addEventListener('click', () => openDashboard(null));
  $('btn-pubs').addEventListener('click', () => open({ view: 'pubs', tab: (st().publications || []).some((p) => PUB_ATTENTION.includes(p.status)) ? 'ready' : 'scheduled' }));
  let readyBefore = null;

  // ---- called after every state refresh
  function onState() {
    const s = st();
    const n = (list) => s.tasks.filter((t) => list.includes(t.status)).length;
    const waiting = n(AWAITING);
    $('stats').innerHTML = `<span class="stat"><b>${s.agents.length}</b> agentes</span><span class="stat"><b>${n(['in_production'])}</b> em produção</span><span class="stat"><b>${n(['in_review'])}</b> com o CoS</span><span class="stat"><b>${waiting}</b> aguardando você</span>`;
    $('inbox-count').hidden = !waiting; $('inbox-count').textContent = waiting;
    const attention = (s.publications || []).filter((p) => PUB_ATTENTION.includes(p.status));
    $('pubs-count').hidden = !attention.length; $('pubs-count').textContent = attention.length;
    const readyNow = new Set(attention.filter((p) => p.status === 'ready').map((p) => p.id));
    if (readyBefore) for (const id of readyNow) if (!readyBefore.has(id)) { const p = s.publications.find((x) => x.id === id); toast(`Hora de publicar no ${CHANNELS[p.channel]}: ${p.task_title}`); }
    readyBefore = readyNow;
    const banner = $('banner');
    banner.hidden = s.llm.configured;
    if (!s.llm.configured) { if (s.llm.hint) banner.textContent = s.llm.hint; else banner.innerHTML = 'Os agentes ainda não conseguem trabalhar: defina <code>ANTHROPIC_API_KEY</code> no ambiente do servidor e reinicie. Você já pode montar as áreas e contratar.'; }
    if (panel?.view === 'task') { const sum = s.tasks.find((t) => t.id === panel.taskId); if (sum) loadTask(sum.id, sum.updated_at); }
    paint(false);
  }

  return { open, openTarget, close, onState, toast, openTask: (taskId) => open({ view: 'task', taskId }) };
}
