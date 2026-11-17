"""Office domain: areas, agents and the task lifecycle. No framework imports here."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from uuid import uuid4

from .errors import DomainError, InvalidTransition

AREA_COUNT = 6
SEATS_PER_AREA = 6  # member seats per table; the head sits at the end (seat 0)
COS_ID = "cos"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid4().hex[:12]


class AgentKind(StrEnum):
    HEAD = "head"
    MEMBER = "member"


@dataclass
class Area:
    id: int
    name: str = ""

    @property
    def is_defined(self) -> bool:
        return bool(self.name.strip())


@dataclass
class Agent:
    id: str
    name: str
    role: str
    kind: AgentKind
    area_id: int
    seat: int
    instructions: str = ""
    look: int = 0
    hired_at: str = field(default_factory=now_iso)

    @staticmethod
    def from_dict(data: dict) -> "Agent":
        return Agent(**{**data, "kind": AgentKind(data["kind"])})


@dataclass
class QualitySettings:
    standards: list[str]
    max_review_rounds: int = 3

    def __post_init__(self) -> None:
        self.standards = [s.strip() for s in self.standards if s.strip()]
        if not self.standards:
            raise DomainError("Defina pelo menos um padrão de qualidade para o CoS avaliar.")
        if not 1 <= self.max_review_rounds <= 10:
            raise DomainError("O número de rodadas de revisão deve ficar entre 1 e 10.")

    @staticmethod
    def default() -> "QualitySettings":
        return QualitySettings(
            standards=[
                "Atende integralmente ao que o briefing pediu, sem fugir do escopo.",
                "Está pronta para uso: sem placeholders, trechos incompletos ou notas internas.",
                "Não contém dados, números ou citações inventados; o que depende de informação ausente está sinalizado.",
                "Português correto, sem erros de ortografia ou gramática.",
                "Clara e bem organizada, no tom adequado ao público descrito no briefing.",
            ]
        )


class TaskStatus(StrEnum):
    IN_PRODUCTION = "in_production"  # com o Head e o time da área
    IN_REVIEW = "in_review"  # na sala do CoS
    DELIVERED = "delivered"  # aprovada pelo CoS, aguardando o Big Boss
    ESCALATED = "escalated"  # CoS reprovou até o limite de rodadas; decisão do Big Boss
    APPROVED = "approved"
    FAILED = "failed"
    CANCELLED = "cancelled"


AUTOMATED = (TaskStatus.IN_PRODUCTION, TaskStatus.IN_REVIEW)
AWAITING_BOSS = (TaskStatus.DELIVERED, TaskStatus.ESCALATED)


@dataclass
class CriterionResult:
    criterion: str
    passed: bool
    comment: str = ""


@dataclass
class Review:
    round: int
    approved: bool
    summary: str
    criteria: list[CriterionResult]
    required_changes: list[str]
    at: str = field(default_factory=now_iso)

    def feedback_text(self) -> str:
        lines = [self.summary.strip()]
        failed = [c for c in self.criteria if not c.passed]
        if failed:
            lines.append("\nPadrões não cumpridos:")
            lines += [f"- {c.criterion} — {c.comment}".rstrip(" —") for c in failed]
        if self.required_changes:
            lines.append("\nAjustes exigidos:")
            lines += [f"- {c}" for c in self.required_changes]
        return "\n".join(lines).strip()


@dataclass
class Contribution:
    agent_id: str
    agent_name: str
    instruction: str
    output: str


@dataclass
class TaskEvent:
    actor: str  # boss | cos | head | agent | system
    message: str
    at: str = field(default_factory=now_iso)


@dataclass
class Activity:
    stage: str  # planning | executing | consolidating | revising | reviewing
    agent_ids: list[str]


@dataclass
class Task:
    id: str
    title: str
    briefing: str
    area_id: int
    status: TaskStatus = TaskStatus.IN_PRODUCTION
    review_round: int = 1
    deliverable: str = ""
    pending_feedback: str = ""
    feedback_from: str = ""  # cos | boss
    contributions: list[Contribution] = field(default_factory=list)
    reviews: list[Review] = field(default_factory=list)
    events: list[TaskEvent] = field(default_factory=list)
    activity: Activity | None = None
    error: str = ""
    failed_from: str = ""
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)

    # ---- factory -------------------------------------------------------
    @staticmethod
    def delegate(title: str, briefing: str, area: Area) -> "Task":
        title, briefing = title.strip(), briefing.strip()
        if not title or not briefing:
            raise DomainError("Informe o título e o briefing da tarefa.")
        task = Task(id=new_id(), title=title, briefing=briefing, area_id=area.id)
        task._log("boss", f"Big Boss delegou a tarefa para a área {area.name}.")
        return task

    # ---- lifecycle -----------------------------------------------------
    def log(self, actor: str, message: str) -> None:
        self._log(actor, message)

    def set_activity(self, stage: str, agent_ids: list[str]) -> None:
        self.activity = Activity(stage, agent_ids)
        self._touch()

    def submit_for_review(self, deliverable: str, contributions: list[Contribution] | None = None) -> None:
        self._require(TaskStatus.IN_PRODUCTION)
        if not deliverable.strip():
            raise DomainError("A área devolveu uma entrega vazia.")
        self.deliverable = deliverable.strip()
        if contributions is not None:
            self.contributions = contributions
        self.pending_feedback = ""
        self.feedback_from = ""
        self.status = TaskStatus.IN_REVIEW
        self.activity = None
        self._touch()

    def record_review(self, review: Review, max_rounds: int) -> None:
        self._require(TaskStatus.IN_REVIEW)
        self.reviews.append(review)
        self.activity = None
        if review.approved:
            self.status = TaskStatus.DELIVERED
            self._log("cos", "CoS aprovou a entrega e encaminhou ao Big Boss.")
        elif self.review_round >= max_rounds:
            self.status = TaskStatus.ESCALATED
            self._log(
                "cos",
                f"CoS reprovou pela {self.review_round}ª vez e escalou a decisão ao Big Boss: {review.summary}",
            )
        else:
            self.pending_feedback = review.feedback_text()
            self.feedback_from = "cos"
            self.review_round += 1
            self.status = TaskStatus.IN_PRODUCTION
            self._log("cos", f"CoS devolveu a entrega para a área: {review.summary}")

    def approve(self) -> None:
        self._require(*AWAITING_BOSS)
        self.status = TaskStatus.APPROVED
        self._log("boss", "Big Boss aprovou a entrega.")

    def request_changes(self, feedback: str) -> None:
        self._require(*AWAITING_BOSS)
        if not feedback.strip():
            raise DomainError("Descreva os ajustes que a área deve fazer.")
        self.pending_feedback = feedback.strip()
        self.feedback_from = "boss"
        self.review_round = 1
        self.status = TaskStatus.IN_PRODUCTION
        self._log("boss", f"Big Boss pediu ajustes: {feedback.strip()}")

    def fail(self, error: str) -> None:
        if self.status not in AUTOMATED:
            return
        self.failed_from = self.status.value
        self.status = TaskStatus.FAILED
        self.error = error
        self.activity = None
        self._log("system", f"Falha na execução: {error}")

    def retry(self) -> None:
        self._require(TaskStatus.FAILED)
        self.status = TaskStatus(self.failed_from or TaskStatus.IN_PRODUCTION.value)
        self.error = ""
        self.failed_from = ""
        self._log("boss", "Big Boss mandou tentar novamente.")

    def cancel(self) -> None:
        if self.status in (TaskStatus.APPROVED, TaskStatus.CANCELLED):
            raise InvalidTransition("Esta tarefa já foi encerrada.")
        self.status = TaskStatus.CANCELLED
        self.activity = None
        self._log("boss", "Big Boss cancelou a tarefa.")

    # ---- helpers -------------------------------------------------------
    def _require(self, *allowed: TaskStatus) -> None:
        if self.status not in allowed:
            raise InvalidTransition(f"A tarefa está em '{self.status.value}' e não permite essa ação.")

    def _log(self, actor: str, message: str) -> None:
        self.events.append(TaskEvent(actor, message))
        self._touch()

    def _touch(self) -> None:
        self.updated_at = now_iso()

    # ---- serialization -------------------------------------------------
    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "Task":
        data = dict(data)
        data["status"] = TaskStatus(data["status"])
        data["contributions"] = [Contribution(**c) for c in data.get("contributions", [])]
        data["reviews"] = [
            Review(**{**r, "criteria": [CriterionResult(**c) for c in r["criteria"]]})
            for r in data.get("reviews", [])
        ]
        data["events"] = [TaskEvent(**e) for e in data.get("events", [])]
        data["activity"] = Activity(**data["activity"]) if data.get("activity") else None
        return Task(**data)


# ---------------------------------------------------------------- social publishing
class Channel(StrEnum):
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


class PublicationStatus(StrEnum):
    SCHEDULED = "scheduled"  # aguardando o horário
    READY = "ready"  # horário chegou e a rede não está conectada: alguém publica e marca como publicada
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


def parse_moment(value: str) -> datetime:
    try:
        moment = datetime.fromisoformat(value.strip())
    except (AttributeError, ValueError) as exc:
        raise DomainError("Data e hora da publicação inválidas.") from exc
    if moment.tzinfo is None:
        raise DomainError("Informe a data e hora da publicação com fuso horário.")
    return moment


@dataclass
class Publication:
    id: str
    task_id: str
    task_title: str
    area_id: int
    channel: Channel
    text: str
    scheduled_at: str
    status: PublicationStatus = PublicationStatus.SCHEDULED
    url: str = ""
    error: str = ""
    published_at: str = ""
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)

    @staticmethod
    def schedule(task: Task, channel: str, text: str, scheduled_at: str) -> "Publication":
        if task.status is not TaskStatus.APPROVED:
            raise DomainError("Só entregas aprovadas por você podem ser publicadas.")
        try:
            chosen = Channel(channel)
        except ValueError as exc:
            raise DomainError("Rede social inválida.") from exc
        if not text.strip():
            raise DomainError("Escreva o texto da publicação.")
        moment = parse_moment(scheduled_at)
        return Publication(
            id=new_id(), task_id=task.id, task_title=task.title, area_id=task.area_id, channel=chosen,
            text=text.strip(), scheduled_at=moment.astimezone(timezone.utc).isoformat(timespec="seconds"),
        )

    def is_due(self, now: datetime) -> bool:
        return self.status is PublicationStatus.SCHEDULED and datetime.fromisoformat(self.scheduled_at) <= now

    def mark_ready(self) -> None:
        self._require(PublicationStatus.SCHEDULED)
        self.status = PublicationStatus.READY
        self._touch()

    def mark_published(self, url: str = "") -> None:
        self._require(PublicationStatus.SCHEDULED, PublicationStatus.READY, PublicationStatus.FAILED)
        self.status = PublicationStatus.PUBLISHED
        self.url = url.strip()
        self.error = ""
        self.published_at = now_iso()
        self._touch()

    def fail(self, error: str) -> None:
        self._require(PublicationStatus.SCHEDULED)
        self.status = PublicationStatus.FAILED
        self.error = error
        self._touch()

    def retry(self) -> None:
        self._require(PublicationStatus.FAILED)
        self.status = PublicationStatus.SCHEDULED
        self.error = ""
        self.scheduled_at = now_iso()
        self._touch()

    def cancel(self) -> None:
        self._require(PublicationStatus.SCHEDULED, PublicationStatus.READY, PublicationStatus.FAILED)
        self.status = PublicationStatus.CANCELLED
        self._touch()

    def _require(self, *allowed: PublicationStatus) -> None:
        if self.status not in allowed:
            raise InvalidTransition("A publicação não permite essa ação no estado atual.")

    def _touch(self) -> None:
        self.updated_at = now_iso()

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "Publication":
        return Publication(**{**data, "channel": Channel(data["channel"]), "status": PublicationStatus(data["status"])})
