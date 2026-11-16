"""HTTP entry point: wires the adapters and exposes the office API plus the web UI."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.application.office_service import OfficeService
from app.application.ports import LlmGateway, OfficeRepository
from app.application.task_workflow import TaskWorkflow
from app.domain.errors import DomainError, NotFound
from app.domain.models import SEATS_PER_AREA, Task

from .schemas import AgentIn, AreaIn, FeedbackIn, HireIn, SettingsIn, TaskIn

WEB_DIR = Path(__file__).resolve().parents[2] / "web"


def _task_summary(task: Task) -> dict:
    last = task.reviews[-1] if task.reviews else None
    return {
        "id": task.id,
        "title": task.title,
        "area_id": task.area_id,
        "status": task.status.value,
        "review_round": task.review_round,
        "activity": asdict(task.activity) if task.activity else None,
        "error": task.error,
        "last_review": {"approved": last.approved, "summary": last.summary} if last else None,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def create_app(repo: OfficeRepository, llm: LlmGateway) -> FastAPI:
    office = OfficeService(repo)
    workflow_holder: dict[str, TaskWorkflow] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        workflow_holder["wf"] = TaskWorkflow(repo, llm)
        workflow_holder["wf"].resume_pending()
        yield

    app = FastAPI(title="Escritório Virtual LFTM", lifespan=lifespan)

    def wf() -> TaskWorkflow:
        return workflow_holder["wf"]

    @app.exception_handler(NotFound)
    async def _not_found(_: Request, exc: NotFound):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(DomainError)
    async def _domain_error(_: Request, exc: DomainError):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.get("/api/state")
    def state():
        tasks = sorted(repo.list_tasks(), key=lambda t: t.created_at, reverse=True)
        return {
            "areas": [asdict(a) for a in repo.list_areas()],
            "agents": [asdict(a) for a in repo.list_agents()],
            "tasks": [_task_summary(t) for t in tasks],
            "settings": asdict(office.get_settings()),
            "llm": llm.describe(),
            "seats_per_area": SEATS_PER_AREA,
        }

    @app.put("/api/areas/{area_id}")
    def define_area(area_id: int, body: AreaIn):
        return asdict(office.define_area(area_id, body.name, body.head_name, body.head_instructions))

    @app.post("/api/agents", status_code=201)
    def hire(body: HireIn):
        return asdict(office.hire(body.area_id, body.seat, body.name, body.role, body.instructions))

    @app.put("/api/agents/{agent_id}")
    def update_agent(agent_id: str, body: AgentIn):
        return asdict(office.update_agent(agent_id, body.name, body.role, body.instructions))

    @app.delete("/api/agents/{agent_id}", status_code=204)
    def dismiss(agent_id: str):
        office.dismiss(agent_id)

    @app.put("/api/settings")
    def update_settings(body: SettingsIn):
        return asdict(office.update_settings(body.standards, body.max_review_rounds))

    @app.post("/api/tasks", status_code=201)
    async def delegate(body: TaskIn):
        return wf().delegate(body.title, body.briefing, body.area_id).to_dict()

    @app.get("/api/tasks")
    def list_tasks():
        """Full tasks (reviews, contributions, events) for the dashboards."""
        return [t.to_dict() for t in repo.list_tasks()]

    @app.get("/api/tasks/{task_id}")
    def get_task(task_id: str):
        return repo.get_task(task_id).to_dict()

    @app.post("/api/tasks/{task_id}/approve")
    async def approve(task_id: str):
        return wf().approve(task_id).to_dict()

    @app.post("/api/tasks/{task_id}/request-changes")
    async def request_changes(task_id: str, body: FeedbackIn):
        return wf().request_changes(task_id, body.feedback).to_dict()

    @app.post("/api/tasks/{task_id}/retry")
    async def retry(task_id: str):
        return wf().retry(task_id).to_dict()

    @app.post("/api/tasks/{task_id}/cancel")
    async def cancel(task_id: str):
        return wf().cancel(task_id).to_dict()

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


def build() -> FastAPI:
    """Production wiring (used by `uvicorn app.api.main:build --factory`)."""
    from app.infrastructure.anthropic_gateway import AnthropicLlmGateway
    from app.infrastructure.sqlite_repository import SqliteOfficeRepository

    repo = SqliteOfficeRepository(os.environ.get("OFFICE_DB_PATH", "data/office.db"))
    llm = AnthropicLlmGateway(
        model=os.environ.get("OFFICE_LLM_MODEL", "claude-opus-5-5"),
        effort=os.environ.get("OFFICE_LLM_EFFORT", "medium"),
    )
    return create_app(repo, llm)
