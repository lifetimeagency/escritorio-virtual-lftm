"""Prompts and output schemas for each role in the office (pt-BR, as the agency works)."""
from __future__ import annotations

from app.domain.models import Agent, Area, Contribution, QualitySettings, Task

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "assignments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string"},
                    "instruction": {"type": "string"},
                },
                "required": ["agent_id", "instruction"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["assignments"],
    "additionalProperties": False,
}

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "criteria": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "criterion": {"type": "string"},
                    "passed": {"type": "boolean"},
                    "comment": {"type": "string"},
                },
                "required": ["criterion", "passed", "comment"],
                "additionalProperties": False,
            },
        },
        "approved": {"type": "boolean"},
        "summary": {"type": "string"},
        "required_changes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["criteria", "approved", "summary", "required_changes"],
    "additionalProperties": False,
}


def _persona(instructions: str) -> str:
    return f"\n\nComo você trabalha:\n{instructions}" if instructions else ""


def _standards(settings: QualitySettings) -> str:
    return "\n".join(f"{i}. {s}" for i, s in enumerate(settings.standards, 1))


def _task_block(task: Task) -> str:
    return f"Tarefa: {task.title}\n\nBriefing da direção:\n{task.briefing}"


def head_system(head: Agent, area: Area) -> str:
    return (
        f"Você é {head.name}, Head da área de {area.name} em uma agência de marketing operada por agentes de IA. "
        "Você recebe as tarefas delegadas pela direção (o Big Boss), coordena o seu time e responde pela qualidade "
        "do que sai da sua área. Tudo o que você entrega passa antes pelo Chief of Staff, que só deixa chegar à "
        "direção o que cumpre os padrões de qualidade da agência."
        + _persona(head.instructions)
    )


def member_system(member: Agent, head: Agent, area: Area) -> str:
    return (
        f"Você é {member.name}, {member.role}, na área de {area.name} de uma agência de marketing operada por "
        f"agentes de IA. Você responde a {head.name}, Head da área, que consolida o trabalho do time na entrega final."
        + _persona(member.instructions)
    )


COS_SYSTEM = (
    "Você é o Chief of Staff de uma agência de marketing operada por agentes de IA. Você é o filtro de qualidade "
    "entre as áreas e a direção: avalia cada entrega contra o briefing e contra os padrões de qualidade da agência, "
    "e só deixa passar o que está pronto. A direção confia que tudo o que chega até ela já foi conferido — aprovar "
    "algo que não cumpre os padrões desperdiça o tempo dela, e reprovar algo bom por preciosismo atrasa a agência. "
    "Julgue pelo que está escrito na entrega, com rigor e objetividade."
)


def plan_prompt(task: Task, team: list[Agent]) -> str:
    roster = "\n".join(
        f"- agent_id: {m.id} | {m.name} | {m.role}" + (f" | {m.instructions}" if m.instructions else "")
        for m in team
    )
    return (
        f"{_task_block(task)}\n\nSeu time:\n{roster}\n\n"
        "Decida quem do time trabalha nesta tarefa e o que cada pessoa deve produzir. Envolva apenas quem "
        "realmente agrega: uma tarefa simples pode pedir uma pessoa só, ou ninguém — nesse caso devolva a lista "
        "vazia e você mesmo produz a entrega. Cada instrução precisa ser autossuficiente (a pessoa vai ler só o "
        "briefing e a sua instrução) e dizer exatamente o que ela deve entregar. Use os agent_id listados acima."
    )


def member_prompt(task: Task, head: Agent, instruction: str) -> str:
    return (
        f"{_task_block(task)}\n\nO que {head.name} pediu a você:\n{instruction}\n\n"
        f"Entregue apenas a sua parte, pronta para {head.name} incorporar na entrega final, sem introduções nem "
        "comentários sobre o processo. Se faltar uma informação essencial que não está no briefing, não invente: "
        "liste-a ao final, em uma seção 'Pendências'."
    )


def deliver_prompt(task: Task, contributions: list[Contribution], settings: QualitySettings) -> str:
    if contributions:
        parts = "\n\n".join(
            f"### {c.agent_name}\nPedido: {c.instruction}\n\nEntregou:\n{c.output}" for c in contributions
        )
        work = (
            f"O que o seu time produziu:\n\n{parts}\n\n"
            "Monte a entrega final a partir dessas contribuições: integre, corrija o que estiver fraco e complete "
            "o que faltar."
        )
    else:
        work = "Produza você mesmo a entrega final desta tarefa."
    return (
        f"{_task_block(task)}\n\n{work}\n\n"
        f"Padrões de qualidade que o Chief of Staff vai conferir:\n{_standards(settings)}\n\n"
        "Responda somente com a entrega final, em Markdown, do jeito que ela deve chegar à direção — sem "
        "comentários sobre o processo. Se o briefing não trouxer uma informação essencial, não invente: sinalize "
        "em uma seção 'Pendências' ao final."
    )


def revise_prompt(task: Task, settings: QualitySettings) -> str:
    who = "pela direção (Big Boss)" if task.feedback_from == "boss" else "pelo Chief of Staff"
    return (
        f"{_task_block(task)}\n\nSua entrega anterior:\n\n{task.deliverable}\n\n"
        f"Ela foi devolvida {who} com este retorno:\n\n{task.pending_feedback}\n\n"
        f"Padrões de qualidade que o Chief of Staff vai conferir:\n{_standards(settings)}\n\n"
        "Reescreva a entrega resolvendo todos os pontos do retorno. Responda somente com a nova versão completa, "
        "em Markdown, sem comentar o que mudou."
    )


def review_prompt(task: Task, settings: QualitySettings) -> str:
    return (
        f"{_task_block(task)}\n\nPadrões de qualidade da agência:\n{_standards(settings)}\n\n"
        f"Entrega da área (rodada {task.review_round} de {settings.max_review_rounds}):\n\n"
        f"<entrega>\n{task.deliverable}\n</entrega>\n\n"
        "Avalie cada padrão separadamente: um item em `criteria` por padrão, na mesma ordem, repetindo o texto do "
        "padrão em `criterion` e justificando em `comment` com o que você viu na entrega. `approved` só é true se "
        "todos os padrões forem cumpridos. `summary` é o seu parecer em uma ou duas frases. Se reprovar, "
        "`required_changes` lista ajustes concretos e acionáveis para o Head; se aprovar, deixe a lista vazia."
    )
