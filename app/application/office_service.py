"""Use cases for staffing the office: defining areas, hiring and dismissing agents."""
from __future__ import annotations

import random

from app.domain.errors import DomainError
from app.domain.models import (
    SEATS_PER_AREA,
    Agent,
    AgentKind,
    Area,
    QualitySettings,
    new_id,
)

from .ports import OfficeRepository


class OfficeService:
    def __init__(self, repo: OfficeRepository) -> None:
        self._repo = repo

    # ---- areas ---------------------------------------------------------
    def define_area(self, area_id: int, name: str, head_name: str, head_instructions: str) -> Area:
        """Names the area and seats its Head at the end of the table (creates or updates)."""
        name, head_name = name.strip(), head_name.strip()
        if not name or not head_name:
            raise DomainError("Informe o nome da área e o nome do Head.")
        area = self._repo.get_area(area_id)
        duplicate = any(a.id != area_id and a.name.lower() == name.lower() for a in self._repo.list_areas())
        if duplicate:
            raise DomainError(f"Já existe uma área chamada {name}.")
        area.name = name
        self._repo.save_area(area)

        head = self.head_of(area_id)
        if head is None:
            head = Agent(
                id=new_id(), name=head_name, role=f"Head de {name}", kind=AgentKind.HEAD,
                area_id=area_id, seat=0, look=random.randrange(1_000_000),
            )
        head.name = head_name
        head.role = f"Head de {name}"
        head.instructions = head_instructions.strip()
        self._repo.save_agent(head)
        return area

    def head_of(self, area_id: int) -> Agent | None:
        return next((a for a in self._members(area_id, AgentKind.HEAD)), None)

    def team_of(self, area_id: int) -> list[Agent]:
        return sorted(self._members(area_id, AgentKind.MEMBER), key=lambda a: a.seat)

    # ---- agents --------------------------------------------------------
    def hire(self, area_id: int, seat: int, name: str, role: str, instructions: str) -> Agent:
        area = self._repo.get_area(area_id)
        if not area.is_defined:
            raise DomainError("Defina a área e o Head desta mesa antes de contratar agentes.")
        if not 1 <= seat <= SEATS_PER_AREA:
            raise DomainError("Lugar inválido nesta mesa.")
        if any(a.seat == seat for a in self.team_of(area_id)):
            raise DomainError("Este lugar já está ocupado.")
        name, role = name.strip(), role.strip()
        if not name or not role:
            raise DomainError("Informe o nome e o cargo do agente.")
        agent = Agent(
            id=new_id(), name=name, role=role, kind=AgentKind.MEMBER, area_id=area_id,
            seat=seat, instructions=instructions.strip(), look=random.randrange(1_000_000),
        )
        self._repo.save_agent(agent)
        return agent

    def update_agent(self, agent_id: str, name: str, role: str, instructions: str) -> Agent:
        agent = self._repo.get_agent(agent_id)
        name, role = name.strip(), role.strip()
        if not name or not role:
            raise DomainError("Informe o nome e o cargo do agente.")
        agent.name, agent.role, agent.instructions = name, role, instructions.strip()
        self._repo.save_agent(agent)
        return agent

    def dismiss(self, agent_id: str) -> None:
        agent = self._repo.get_agent(agent_id)
        if agent.kind is AgentKind.HEAD:
            raise DomainError("O Head não pode ser desligado; troque-o editando a área.")
        self._repo.delete_agent(agent_id)

    # ---- quality standards --------------------------------------------
    def get_settings(self) -> QualitySettings:
        return self._repo.get_settings()

    def update_settings(self, standards: list[str], max_review_rounds: int) -> QualitySettings:
        settings = QualitySettings(standards=standards, max_review_rounds=max_review_rounds)
        self._repo.save_settings(settings)
        return settings

    # ---- helpers -------------------------------------------------------
    def _members(self, area_id: int, kind: AgentKind) -> list[Agent]:
        return [a for a in self._repo.list_agents() if a.area_id == area_id and a.kind is kind]
