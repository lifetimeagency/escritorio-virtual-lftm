// Serverless build of the office API for the claude.ai Artifact: same interface as ../js/api.js,
// but the office is stored in the artifact database and the agents run on the viewer's Claude.
// The task pipeline mirrors app/application/task_workflow.py and prompts.py.
const TAB = crypto.randomUUID();
const AREA_COUNT = 6, SEATS = 6;
const AUTOMATED = ['in_production', 'in_review'];
const AWAITING = ['delivered', 'escalated'];
const DEFAULT_SETTINGS = {
  standards: [
    'Atende integralmente ao que o briefing pediu, sem fugir do escopo.',
    'Está pronta para uso: sem placeholders, trechos incompletos ou notas internas.',
    'Não contém dados, números ou citações inventados; o que depende de informação ausente está sinalizado.',
    'Português correto, sem erros de ortografia ou gramática.',
    'Clara e bem organizada, no tom adequado ao público descrito no briefing.',
  ],
  max_review_rounds: 3,
};

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const clone = (v) => JSON.parse(JSON.stringify(v));
const deny = (msg) => { throw new Error(msg); };
const ABORT = Symbol('abort');

// ---- store: live mirror of the artifact database (memory only when no database is available)
const mem = { areas: new Map(), agents: new Map(), tasks: new Map(), config: new Map() };
let db = null, sample = null;

function mirror(name) {
  return new Promise((resolve) => {
    db.collection(name).onSnapshot((snap) => {
      mem[name].clear();
      for (const d of snap.docs) mem[name].set(d.id, d.data());
      resolve();
    }, resolve);
  });
}
const ready = (async () => {
  const claude = window.claude;
  if (claude?.use) [db, sample] = await Promise.all([claude.use('db'), claude.use('sample')]);
  if (db) await Promise.race([Promise.all(['areas', 'agents', 'tasks', 'config'].map(mirror)), new Promise((r) => setTimeout(r, 10000))]);
  // Tasks left mid-flight by a closed tab are picked up once, by whoever opens the office next.
  for (const t of mem.tasks.values()) if (AUTOMATED.includes(t.status)) spawn(t.id);
})();

async function put(name, id, data) {
  mem[name].set(String(id), data);
  if (db) await db.doc(`${name}/${id}`).set(data);
}
async function remove(name, id) {
  mem[name].delete(String(id));
  if (db) await db.doc(`${name}/${id}`).delete();
}
async function saveTask(task) {
  task.updated_at = now();
  try { await put('tasks', task.id, task); } catch (e) {
    // A very long delivery plus every contribution can pass the document size limit: keep the delivery.
    task.contributions = task.contributions.map((c) => ({ ...c, output: `${c.output.slice(0, 2000)}…` }));
    await put('tasks', task.id, task);
  }
}

const areas = () => Array.from({ length: AREA_COUNT }, (_, i) => mem.areas.get(String(i + 1)) || { id: i + 1, name: '' });
const getArea = (id) => areas().find((a) => a.id === Number(id)) || deny('Área não encontrada.');
const agents = () => [...mem.agents.values()];
const headOf = (areaId) => agents().find((a) => a.area_id === areaId && a.kind === 'head');
const teamOf = (areaId) => agents().filter((a) => a.area_id === areaId && a.kind === 'member').sort((a, b) => a.seat - b.seat);
const settings = () => mem.config.get('quality') || DEFAULT_SETTINGS;
const getTask = (id) => (mem.tasks.has(id) ? clone(mem.tasks.get(id)) : deny('Tarefa não encontrada.'));

// ---- task lifecycle (same rules as app/domain/models.py)
function log(task, actor, message) { task.events.push({ actor, message, at: now() }); }
function need(task, ...allowed) { if (!allowed.includes(task.status)) deny('A tarefa não permite essa ação no estado atual.'); }
function submit(task, deliverable, contributions) {
  if (!deliverable.trim()) deny('A área devolveu uma entrega vazia.');
  task.deliverable = deliverable.trim();
  if (contributions) task.contributions = contributions;
  task.pending_feedback = ''; task.feedback_from = ''; task.status = 'in_review'; task.activity = null;
}
function feedbackText(r) {
  const lines = [r.summary];
  const failed = r.criteria.filter((c) => !c.passed);
  if (failed.length) lines.push('\nPadrões não cumpridos:', ...failed.map((c) => `- ${c.criterion} — ${c.comment}`));
  if (r.required_changes.length) lines.push('\nAjustes exigidos:', ...r.required_changes.map((c) => `- ${c}`));
  return lines.join('\n').trim();
}
function recordReview(task, review, maxRounds) {
  task.reviews.push(review); task.activity = null;
  if (review.approved) { task.status = 'delivered'; log(task, 'cos', 'CoS aprovou a entrega e encaminhou ao Big Boss.'); }
  else if (task.review_round >= maxRounds) { task.status = 'escalated'; log(task, 'cos', `CoS reprovou pela ${task.review_round}ª vez e escalou a decisão ao Big Boss: ${review.summary}`); }
  else {
    task.pending_feedback = feedbackText(review); task.feedback_from = 'cos'; task.review_round += 1; task.status = 'in_production';
    log(task, 'cos', `CoS devolveu a entrega para a área: ${review.summary}`);
  }
}

// ---- prompts (same text as app/application/prompts.py)
const persona = (i) => (i ? `\n\nComo você trabalha:\n${i}` : '');
const standardsList = (s) => s.standards.map((x, i) => `${i + 1}. ${x}`).join('\n');
const taskBlock = (t) => `Tarefa: ${t.title}\n\nBriefing da direção:\n${t.briefing}`;
const headSystem = (head, area) => `Você é ${head.name}, Head da área de ${area.name} em uma agência de marketing operada por agentes de IA. Você recebe as tarefas delegadas pela direção (o Big Boss), coordena o seu time e responde pela qualidade do que sai da sua área. Tudo o que você entrega passa antes pelo Chief of Staff, que só deixa chegar à direção o que cumpre os padrões de qualidade da agência.${persona(head.instructions)}`;
const memberSystem = (m, head, area) => `Você é ${m.name}, ${m.role}, na área de ${area.name} de uma agência de marketing operada por agentes de IA. Você responde a ${head.name}, Head da área, que consolida o trabalho do time na entrega final.${persona(m.instructions)}`;
const COS_SYSTEM = 'Você é o Chief of Staff de uma agência de marketing operada por agentes de IA. Você é o filtro de qualidade entre as áreas e a direção: avalia cada entrega contra o briefing e contra os padrões de qualidade da agência, e só deixa passar o que está pronto. A direção confia que tudo o que chega até ela já foi conferido — aprovar algo que não cumpre os padrões desperdiça o tempo dela, e reprovar algo bom por preciosismo atrasa a agência. Julgue pelo que está escrito na entrega, com rigor e objetividade.';
const planPrompt = (t, team) => `${taskBlock(t)}\n\nSeu time:\n${team.map((m) => `- agent_id: ${m.id} | ${m.name} | ${m.role}${m.instructions ? ` | ${m.instructions}` : ''}`).join('\n')}\n\nDecida quem do time trabalha nesta tarefa e o que cada pessoa deve produzir. Envolva apenas quem realmente agrega: uma tarefa simples pode pedir uma pessoa só, ou ninguém — nesse caso devolva a lista vazia e você mesmo produz a entrega. Cada instrução precisa ser autossuficiente (a pessoa vai ler só o briefing e a sua instrução) e dizer exatamente o que ela deve entregar. Use os agent_id listados acima.\n\nResponda apenas com um objeto JSON neste formato: {"assignments": [{"agent_id": "…", "instruction": "…"}]}`;
const memberPrompt = (t, head, instruction) => `${taskBlock(t)}\n\nO que ${head.name} pediu a você:\n${instruction}\n\nEntregue apenas a sua parte, pronta para ${head.name} incorporar na entrega final, sem introduções nem comentários sobre o processo. Se faltar uma informação essencial que não está no briefing, não invente: liste-a ao final, em uma seção 'Pendências'.`;
function deliverPrompt(t, contributions, s) {
  const work = contributions.length
    ? `O que o seu time produziu:\n\n${contributions.map((c) => `### ${c.agent_name}\nPedido: ${c.instruction}\n\nEntregou:\n${c.output}`).join('\n\n')}\n\nMonte a entrega final a partir dessas contribuições: integre, corrija o que estiver fraco e complete o que faltar.`
    : 'Produza você mesmo a entrega final desta tarefa.';
  return `${taskBlock(t)}\n\n${work}\n\nPadrões de qualidade que o Chief of Staff vai conferir:\n${standardsList(s)}\n\nResponda somente com a entrega final, em Markdown, do jeito que ela deve chegar à direção — sem comentários sobre o processo. Se o briefing não trouxer uma informação essencial, não invente: sinalize em uma seção 'Pendências' ao final.`;
}
const revisePrompt = (t, s) => `${taskBlock(t)}\n\nSua entrega anterior:\n\n${t.deliverable}\n\nEla foi devolvida ${t.feedback_from === 'boss' ? 'pela direção (Big Boss)' : 'pelo Chief of Staff'} com este retorno:\n\n${t.pending_feedback}\n\nPadrões de qualidade que o Chief of Staff vai conferir:\n${standardsList(s)}\n\nReescreva a entrega resolvendo todos os pontos do retorno. Responda somente com a nova versão completa, em Markdown, sem comentar o que mudou.`;
const reviewPrompt = (t, s) => `${taskBlock(t)}\n\nPadrões de qualidade da agência:\n${standardsList(s)}\n\nEntrega da área (rodada ${t.review_round} de ${s.max_review_rounds}):\n\n<entrega>\n${t.deliverable}\n</entrega>\n\nAvalie cada padrão separadamente: um item em "criteria" por padrão, na mesma ordem, repetindo o texto do padrão em "criterion" e justificando em "comment" com o que você viu na entrega. "approved" só é true se todos os padrões forem cumpridos. "summary" é o seu parecer em uma ou duas frases. Se reprovar, "required_changes" lista ajustes concretos e acionáveis para o Head; se aprovar, deixe a lista vazia.\n\nResponda apenas com um objeto JSON neste formato: {"criteria": [{"criterion": "…", "passed": true, "comment": "…"}], "approved": true, "summary": "…", "required_changes": ["…"]}`;

// ---- Claude calls (two at a time; the platform queues the rest)
let active = 0; const waiting = [];
async function slot(fn) {
  if (active >= 2) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}
const LLM_ERRORS = {
  not_granted: 'Você não autorizou esta página a usar o Claude. Recarregue a página e permita para os agentes trabalharem.',
  rate_limited: 'Limite de uso do Claude atingido. Tente novamente mais tarde.',
  refused: 'O Claude recusou este pedido. Revise o briefing e tente novamente.',
  invalid_json: 'O agente devolveu uma resposta fora do formato esperado. Tente novamente.',
  session_expired: 'Sua sessão no Claude expirou. Entre de novo e tente novamente.',
};
function llmMessage(e) {
  if (e instanceof Error) return e.message;
  return LLM_ERRORS[e?.code] || `O Claude não respondeu (${e?.code || 'erro'}). Tente novamente.`;
}
async function text(system, prompt) {
  if (!sample) deny('O Claude não está disponível nesta visualização. Abra o artefato logado no claude.ai.');
  const r = await slot(() => sample(`${system}\n\n---\n\n${prompt}`, { cache: false }));
  if (r.truncated) deny('A resposta ficou longa demais e foi cortada. Divida a tarefa em partes menores.');
  return r.text.trim() || deny('O agente não devolveu conteúdo.');
}
async function structured(system, prompt) {
  if (!sample) deny('O Claude não está disponível nesta visualização. Abra o artefato logado no claude.ai.');
  const v = await slot(() => sample.json(`${system}\n\n---\n\n${prompt}`, { cache: false }));
  return v && typeof v === 'object' ? v : deny(LLM_ERRORS.invalid_json);
}

// ---- engine
const running = new Set();
async function spawn(id) {
  if (running.has(id)) return;
  running.add(id);
  const lease = () => db.doc(`tasks/${id}`).acquire({ holder: TAB, ttlMs: 120000 });
  let beat;
  try {
    if (db) {
      const got = await lease();
      if (!got.acquired) return; // another open tab is already running this task
      beat = setInterval(() => lease().catch(() => {}), 45000);
    }
    for (let t = getTask(id); AUTOMATED.includes(t.status); t = getTask(id)) {
      if (t.status === 'in_production') await produce(t); else await review(t);
    }
  } catch (e) {
    if (e !== ABORT) {
      const t = mem.tasks.has(id) && getTask(id);
      if (t && AUTOMATED.includes(t.status)) {
        t.failed_from = t.status; t.status = 'failed'; t.error = llmMessage(e); t.activity = null;
        log(t, 'system', `Falha na execução: ${t.error}`);
        await saveTask(t).catch(() => {});
      }
    }
  } finally {
    clearInterval(beat);
    if (db) db.doc(`tasks/${id}`).acquire({ holder: TAB, ttlMs: 1000 }).catch(() => {});
    running.delete(id);
  }
}
// Applies a change to the stored task; stops the run if the boss cancelled or changed it meanwhile.
async function update(task, mutate) {
  const fresh = mem.tasks.has(task.id) ? getTask(task.id) : null;
  if (!fresh || fresh.status !== task.status) throw ABORT;
  mutate(fresh);
  await saveTask(fresh);
  return fresh;
}
async function produce(task) {
  const area = getArea(task.area_id), head = headOf(task.area_id);
  if (!head) deny('A área desta tarefa está sem Head.');
  const s = settings(), system = headSystem(head, area);
  if (task.pending_feedback && task.deliverable) {
    task = await update(task, (t) => { t.activity = { stage: 'revising', agent_ids: [head.id] }; });
    const revised = await text(system, revisePrompt(task, s));
    await update(task, (t) => { log(t, 'head', `${head.name} revisou a entrega e reenviou ao CoS.`); submit(t, revised); });
    return;
  }
  let contributions = [];
  const team = teamOf(task.area_id);
  if (team.length) {
    task = await update(task, (t) => { t.activity = { stage: 'planning', agent_ids: [head.id] }; });
    const plan = await structured(system, planPrompt(task, team));
    const byId = Object.fromEntries(team.map((m) => [m.id, m]));
    const assignments = (Array.isArray(plan.assignments) ? plan.assignments : [])
      .filter((a) => byId[a?.agent_id] && String(a.instruction || '').trim())
      .map((a) => ({ member: byId[a.agent_id], instruction: String(a.instruction) }));
    if (assignments.length) {
      task = await update(task, (t) => {
        log(t, 'head', `${head.name} distribuiu a tarefa para: ${assignments.map((a) => a.member.name).join(', ')}.`);
        t.activity = { stage: 'executing', agent_ids: assignments.map((a) => a.member.id) };
      });
      const outputs = await Promise.all(assignments.map((a) => text(memberSystem(a.member, head, area), memberPrompt(task, head, a.instruction))));
      contributions = assignments.map((a, i) => ({ agent_id: a.member.id, agent_name: a.member.name, instruction: a.instruction, output: outputs[i] }));
    }
  }
  task = await update(task, (t) => { t.activity = { stage: 'consolidating', agent_ids: [head.id] }; });
  const deliverable = await text(system, deliverPrompt(task, contributions, s));
  await update(task, (t) => { log(t, 'head', `${head.name} fechou a entrega e enviou ao CoS.`); submit(t, deliverable, contributions); });
}
async function review(task) {
  const s = settings();
  task = await update(task, (t) => { t.activity = { stage: 'reviewing', agent_ids: ['cos'] }; });
  const v = await structured(COS_SYSTEM, reviewPrompt(task, s));
  const criteria = (Array.isArray(v.criteria) ? v.criteria : []).map((c) => ({ criterion: String(c.criterion || ''), passed: c.passed === true, comment: String(c.comment || '') }));
  const verdict = {
    round: task.review_round,
    approved: v.approved === true && criteria.length > 0 && criteria.every((c) => c.passed), // one failed standard sends it back
    summary: String(v.summary || '').trim(),
    criteria,
    required_changes: (Array.isArray(v.required_changes) ? v.required_changes : []).map(String).filter((c) => c.trim()),
    at: now(),
  };
  await update(task, (t) => recordReview(t, verdict, s.max_review_rounds));
}

// ---- public API (same shape as the HTTP client)
function summary(t) {
  const last = t.reviews[t.reviews.length - 1];
  return {
    id: t.id, title: t.title, area_id: t.area_id, status: t.status, review_round: t.review_round, activity: t.activity,
    error: t.error, last_review: last ? { approved: last.approved, summary: last.summary } : null,
    created_at: t.created_at, updated_at: t.updated_at,
  };
}
const clean = (v) => String(v ?? '').trim();
async function bossAction(id, change, rerun) {
  await ready;
  const t = getTask(id);
  change(t);
  await saveTask(t);
  if (rerun) spawn(id);
  return t;
}

export const api = {
  async state() {
    await ready;
    const tasks = [...mem.tasks.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(summary);
    const hint = !db ? 'Abra este artefato logado no claude.ai para salvar o escritório e colocar os agentes para trabalhar.'
      : 'O Claude não está disponível nesta visualização, então os agentes não conseguem trabalhar aqui.';
    return { areas: areas(), agents: agents(), tasks, settings: settings(), seats_per_area: SEATS, llm: { configured: !!(db && sample), hint } };
  },
  async defineArea(id, body) {
    await ready;
    const area = getArea(id), name = clean(body.name), headName = clean(body.head_name);
    if (!name || !headName) deny('Informe o nome da área e o nome do Head.');
    if (areas().some((a) => a.id !== area.id && a.name.toLowerCase() === name.toLowerCase())) deny(`Já existe uma área chamada ${name}.`);
    await put('areas', area.id, { id: area.id, name });
    const head = headOf(area.id) || { id: newId(), kind: 'head', area_id: area.id, seat: 0, look: Math.floor(Math.random() * 1e6), hired_at: now() };
    await put('agents', head.id, { ...head, name: headName, role: `Head de ${name}`, instructions: clean(body.head_instructions) });
    return { id: area.id, name };
  },
  async hire(body) {
    await ready;
    const area = getArea(body.area_id), name = clean(body.name), role = clean(body.role);
    if (!area.name) deny('Defina a área e o Head desta mesa antes de contratar agentes.');
    if (!(body.seat >= 1 && body.seat <= SEATS)) deny('Lugar inválido nesta mesa.');
    if (teamOf(area.id).some((a) => a.seat === body.seat)) deny('Este lugar já está ocupado.');
    if (!name || !role) deny('Informe o nome e o cargo do agente.');
    const agent = { id: newId(), name, role, kind: 'member', area_id: area.id, seat: body.seat, instructions: clean(body.instructions), look: Math.floor(Math.random() * 1e6), hired_at: now() };
    await put('agents', agent.id, agent);
    return agent;
  },
  async updateAgent(id, body) {
    await ready;
    const agent = mem.agents.get(id) || deny('Agente não encontrado.');
    const name = clean(body.name), role = clean(body.role);
    if (!name || !role) deny('Informe o nome e o cargo do agente.');
    const next = { ...agent, name, role, instructions: clean(body.instructions) };
    await put('agents', id, next);
    return next;
  },
  async dismiss(id) {
    await ready;
    const agent = mem.agents.get(id) || deny('Agente não encontrado.');
    if (agent.kind === 'head') deny('O Head não pode ser desligado; troque-o editando a área.');
    await remove('agents', id);
    return null;
  },
  async saveSettings(body) {
    await ready;
    const standards = body.standards.map(clean).filter(Boolean);
    if (!standards.length) deny('Defina pelo menos um padrão de qualidade para o CoS avaliar.');
    if (!(body.max_review_rounds >= 1 && body.max_review_rounds <= 10)) deny('O número de rodadas de revisão deve ficar entre 1 e 10.');
    const next = { standards, max_review_rounds: Math.floor(body.max_review_rounds) };
    await put('config', 'quality', next);
    return next;
  },
  async delegate(body) {
    await ready;
    const area = getArea(body.area_id), title = clean(body.title), briefing = clean(body.briefing);
    if (!area.name || !headOf(area.id)) deny('Esta mesa ainda não tem área e Head definidos.');
    if (!title || !briefing) deny('Informe o título e o briefing da tarefa.');
    const task = {
      id: newId(), title, briefing, area_id: area.id, status: 'in_production', review_round: 1, deliverable: '', pending_feedback: '',
      feedback_from: '', contributions: [], reviews: [], events: [], activity: null, error: '', failed_from: '', created_at: now(), updated_at: now(),
    };
    log(task, 'boss', `Big Boss delegou a tarefa para a área ${area.name}.`);
    await saveTask(task);
    spawn(task.id);
    return task;
  },
  async task(id) { await ready; return getTask(id); },
  approve: (id) => bossAction(id, (t) => { need(t, ...AWAITING); t.status = 'approved'; log(t, 'boss', 'Big Boss aprovou a entrega.'); }),
  requestChanges: (id, feedback) => bossAction(id, (t) => {
    need(t, ...AWAITING);
    if (!clean(feedback)) deny('Descreva os ajustes que a área deve fazer.');
    t.pending_feedback = clean(feedback); t.feedback_from = 'boss'; t.review_round = 1; t.status = 'in_production';
    log(t, 'boss', `Big Boss pediu ajustes: ${clean(feedback)}`);
  }, true),
  retry: (id) => bossAction(id, (t) => {
    need(t, 'failed');
    t.status = t.failed_from || 'in_production'; t.error = ''; t.failed_from = '';
    log(t, 'boss', 'Big Boss mandou tentar novamente.');
  }, true),
  cancel: (id) => bossAction(id, (t) => {
    if (['approved', 'cancelled'].includes(t.status)) deny('Esta tarefa já foi encerrada.');
    t.status = 'cancelled'; t.activity = null; log(t, 'boss', 'Big Boss cancelou a tarefa.');
  }),
};
