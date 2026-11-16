# Escritório Virtual LFTM

Escritório virtual isométrico para operar a agência de marketing com agentes de IA.

## Contexto

A direção (Big Boss) precisa delegar trabalho a áreas operadas por agentes de IA e receber de volta apenas o que
está pronto. O escritório dá forma a esse fluxo: seis mesas (uma por área, Head na ponta) e, no mezanino, a sala do
Chief of Staff (filtro de qualidade) e a sala do Big Boss.

## Comportamento esperado

1. **Montar a agência** — clicar na ponta de uma mesa define a área e senta o Head; clicar em uma cadeira vazia
   contrata um agente (nome, cargo, instruções). Seis lugares por mesa.
2. **Delegar** — o Big Boss escolhe a área, escreve título e briefing.
3. **Produzir** — o Head distribui a tarefa para quem do time agrega, cada agente entrega a sua parte e o Head fecha
   a entrega. Sem time, o Head produz sozinho.
4. **Portão de qualidade** — o CoS avalia a entrega padrão por padrão. Um padrão reprovado devolve a entrega ao Head
   com os ajustes exigidos, antes de chegar ao Big Boss. Após o limite de rodadas (padrão: 3), o CoS escala a decisão.
5. **Decidir** — o Big Boss aprova ou pede ajustes (volta para a área e passa de novo pelo CoS).

Os padrões de qualidade e o número de rodadas são editados na sala do CoS.

Cada mesa tem uma tela de dashboard (também no botão **Dashboards**): tarefas por etapa, entregas ao longo do
tempo, padrões que mais devolvem entregas, participação do time e a lista de tarefas, com filtro de período e área.
Os números saem das próprias tarefas; novos blocos entram em `BLOCKS`, em `web/js/dashboard.js`.

## Duas formas de rodar

| | Artefato (claude.ai) | Servidor (este repositório) |
|---|---|---|
| Onde roda | Página publicada no claude.ai | FastAPI + SQLite |
| Agentes | Claude da pessoa que está com a página aberta | API do Claude (`ANTHROPIC_API_KEY`) |
| Dados | Banco do próprio artefato | `data/office.db` |
| Execução | Enquanto a página está aberta (retoma ao reabrir) | Em segundo plano no servidor |

A interface (`web/js`) é a mesma; só muda o módulo de API (`web/js/api.js` no servidor, `web/artifact/api.js` no
artefato).

### Servidor

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
export ANTHROPIC_API_KEY=...            # sem a chave o escritório abre, mas as tarefas falham com aviso
.venv/bin/uvicorn app.api.main:build --factory --host 127.0.0.1 --port 8000
.venv/bin/python -m pytest
```

Variáveis opcionais: `OFFICE_DB_PATH` (padrão `data/office.db`), `OFFICE_LLM_MODEL` (padrão `claude-opus-5-5`),
`OFFICE_LLM_EFFORT` (padrão `medium`).

### Artefato

```bash
python tools/build_artifact.py   # gera dist/artifact/escritorio-virtual.html
```

A fonte da marca (Urbane) é licenciada e não fica no repositório: no servidor ela vem do kit da Adobe Fonts; no
artefato, o build embute os arquivos se eles estiverem em `web/fonts/` (`urbane-light.ttf`, `urbane-medium.ttf`,
`urbane-demibold.ttf`) e, sem eles, usa Montserrat.

Publicar a página com os módulos de `web/js` ao lado, usando `web/artifact/api.js` como `js/api.js`, mais
`web/img/logo-white.png` como `img/logo-white.png`, e as capacidades `db` e `sample`.

## Arquitetura (servidor)

```
app/domain          entidades e ciclo de vida da tarefa (sem framework)
app/application     casos de uso, prompts e portas (OfficeRepository, LlmGateway)
app/infrastructure  SQLite e API do Claude (adaptadores)
app/api             FastAPI: rotas e composição
web                 interface (canvas isométrico + painel), sem etapa de build
```

## Restrições

- Briefings são enviados ao modelo: **não incluir dados pessoais de clientes** (CPF, patrimônio, carteira, dados
  bancários).
- O provedor do modelo fica atrás da porta `LlmGateway`; trocar de provedor é trocar o adaptador.
- O servidor não tem autenticação e escuta em `127.0.0.1`. Não expor em rede sem colocar autenticação na frente.

## Fora do escopo

- Autenticação/SSO e perfis de acesso no servidor.
- Infraestrutura Azure (IaC, pipeline de deploy).
- Ferramentas para os agentes (busca na web, arquivos, integrações) — hoje eles produzem texto a partir do briefing.
- Histórico de conversas com agentes individuais; a comunicação segue o fluxo Big Boss → Head → CoS → Big Boss.
