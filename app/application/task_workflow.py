"""Task pipeline: Big Boss -> Head (+ team) -> CoS quality gate -> Big Boss.

The CoS returns a delivery to the area until it meets the quality standards; only
approved work (or work that exhausted the review rounds) reaches the Big Boss.
"""
from __future__ import annotations

import asyncio
import logging

from app.domain.errors import DomainError
from app.domain.models import (
    AUTOMATED,
    COS_ID,
    Agent,
    AgentKind,
    Contribution,
    CriterionResult,
    Review,
    Task,
    TaskStatus,
)

from . import prompts
from .ports import LlmError, LlmGateway, OfficeRepository

log = logging.getLogger(__name__)


class TaskWorkflow:
    def __init__(self, repo: OfficeRepository, llm: LlmGateway, max_parallel_calls: int = 4) -> None:
        self._repo = repo
        self._llm = llm
        self._slots = asyncio.Semaphore(max_parallel_calls)
        self._running: dict[str, asyncio.Task] = {}

    # ---- commands from the Big Boss -----------------------------------
    def delegate(self, title: str, briefing: str, area_id: int) -> Task:
        area = self._repo.get_area(area_id)
        if not area.is_defined or self._head(area_id) is None:
            raise DomainError("Esta mesa ainda não tem área e Head definidos.")
        task = Task.delegate(title, briefing, area)
        self._repo.save_task(task)
        self._spawn(task.id)
        return task

    def approve(self, task_id: str) -> Task:
        task = self._repo.get_task(task_id)
        task.approve()
        self._repo.save_task(task)
        return task

    def request_changes(self, task_id: str, feedback: str) -> Task:
        task = self._repo.get_task(task_id)
        task.request_changes(feedback)
        self._repo.save_task(task)
        self._spawn(task.id)
        return task

    def retry(self, task_id: str) -> Task:
        task = self._repo.get_task(task_id)
        task.retry()
        self._repo.save_task(task)
        self._spawn(task.id)
        return task

    def cancel(self, task_id: str) -> Task:
        task = self._repo.get_task(task_id)
        task.cancel()
        self._repo.save_task(task)
        running = self._running.pop(task_id, None)
        if running:
            running.cancel()
        return task

    def resume_pending(self) -> None:
        """Re-runs tasks that were mid-flight when the server stopped."""
        for task in self._repo.list_tasks():
            if task.status in AUTOMATED:
                self._spawn(task.id)

    async def wait_idle(self) -> None:
        while self._running:
            await asyncio.gather(*self._running.values(), return_exceptions=True)

    # ---- engine --------------------------------------------------------
    def _spawn(self, task_id: str) -> None:
        current = self._running.get(task_id)
        if current and not current.done():
            return
        runner = asyncio.get_running_loop().create_task(self._run(task_id))
        self._running[task_id] = runner

        def _forget(_: asyncio.Task) -> None:
            if self._running.get(task_id) is runner:
                del self._running[task_id]

        runner.add_done_callback(_forget)

    async def _run(self, task_id: str) -> None:
        try:
            while (task := self._repo.get_task(task_id)).status in AUTOMATED:
                if task.status is TaskStatus.IN_PRODUCTION:
                    await self._produce(task)
                else:
                    await self._review(task)
        except asyncio.CancelledError:
            raise
        except (LlmError, DomainError) as exc:
            self._fail(task_id, str(exc))
        except Exception:  # noqa: BLE001 - never leave a task stuck in an automated state
            log.exception("Unexpected failure running task %s", task_id)
            self._fail(task_id, "Erro inesperado na execução. Veja o log do servidor.")

    def _fail(self, task_id: str, error: str) -> None:
        task = self._repo.get_task(task_id)
        task.fail(error)
        self._repo.save_task(task)

    async def _produce(self, task: Task) -> None:
        area = self._repo.get_area(task.area_id)
        head = self._head(task.area_id)
        if head is None:
            raise DomainError("A área desta tarefa está sem Head.")
        settings = self._repo.get_settings()
        system = prompts.head_system(head, area)

        if task.pending_feedback and task.deliverable:
            self._update(task, lambda t: t.set_activity("revising", [head.id]))
            deliverable = await self._text(system, prompts.revise_prompt(task, settings))
            self._update(task, lambda t: (
                t.log("head", f"{head.name} revisou a entrega e reenviou ao CoS."),
                t.submit_for_review(deliverable),
            ))
            return

        contributions: list[Contribution] = []
        team = self._team(task.area_id)
        if team:
            self._update(task, lambda t: t.set_activity("planning", [head.id]))
            plan = await self._structured(system, prompts.plan_prompt(task, team), prompts.PLAN_SCHEMA)
            by_id = {m.id: m for m in team}
            assignments = [
                (by_id[a["agent_id"]], a["instruction"])
                for a in plan.get("assignments", [])
                if a.get("agent_id") in by_id and a.get("instruction", "").strip()
            ]
            if assignments:
                names = ", ".join(m.name for m, _ in assignments)
                self._update(task, lambda t: (
                    t.log("head", f"{head.name} distribuiu a tarefa para: {names}."),
                    t.set_activity("executing", [m.id for m, _ in assignments]),
                ))
                outputs = await asyncio.gather(*(
                    self._text(prompts.member_system(m, head, area), prompts.member_prompt(task, head, instruction))
                    for m, instruction in assignments
                ))
                contributions = [
                    Contribution(m.id, m.name, instruction, output)
                    for (m, instruction), output in zip(assignments, outputs)
                ]

        self._update(task, lambda t: t.set_activity("consolidating", [head.id]))
        deliverable = await self._text(system, prompts.deliver_prompt(task, contributions, settings))
        self._update(task, lambda t: (
            t.log("head", f"{head.name} fechou a entrega e enviou ao CoS."),
            t.submit_for_review(deliverable, contributions),
        ))

    async def _review(self, task: Task) -> None:
        settings = self._repo.get_settings()
        self._update(task, lambda t: t.set_activity("reviewing", [COS_ID]))
        verdict = await self._structured(
            prompts.COS_SYSTEM, prompts.review_prompt(task, settings), prompts.REVIEW_SCHEMA
        )
        criteria = [
            CriterionResult(c["criterion"], bool(c["passed"]), c.get("comment", ""))
            for c in verdict.get("criteria", [])
        ]
        # The gate is strict: one failed standard is enough to send the work back.
        approved = bool(verdict.get("approved")) and bool(criteria) and all(c.passed for c in criteria)
        review = Review(
            round=task.review_round,
            approved=approved,
            summary=verdict.get("summary", "").strip(),
            criteria=criteria,
            required_changes=[c for c in verdict.get("required_changes", []) if c.strip()],
        )
        self._update(task, lambda t: t.record_review(review, settings.max_review_rounds))

    # ---- helpers -------------------------------------------------------
    def _update(self, task: Task, mutate) -> None:
        """Applies a mutation to the stored task; aborts the run if the boss cancelled it meanwhile."""
        fresh = self._repo.get_task(task.id)
        if fresh.status is not task.status:
            raise asyncio.CancelledError()
        mutate(fresh)
        self._repo.save_task(fresh)
        task.__dict__.update(fresh.__dict__)

    async def _text(self, system: str, prompt: str) -> str:
        async with self._slots:
            return await self._llm.generate_text(system, prompt)

    async def _structured(self, system: str, prompt: str, schema: dict) -> dict:
        async with self._slots:
            return await self._llm.generate_structured(system, prompt, schema)

    def _head(self, area_id: int) -> Agent | None:
        return next(
            (a for a in self._repo.list_agents() if a.area_id == area_id and a.kind is AgentKind.HEAD), None
        )

    def _team(self, area_id: int) -> list[Agent]:
        members = [a for a in self._repo.list_agents() if a.area_id == area_id and a.kind is AgentKind.MEMBER]
        return sorted(members, key=lambda a: a.seat)
