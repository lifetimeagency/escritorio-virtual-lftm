import asyncio

import pytest

from app.application.office_service import OfficeService
from app.application.ports import LlmError
from app.application.task_workflow import TaskWorkflow
from app.domain.errors import DomainError
from app.domain.models import TaskStatus
from app.infrastructure.sqlite_repository import SqliteOfficeRepository

from .fakes import FakeLlm


def office(llm: FakeLlm):
    repo = SqliteOfficeRepository(":memory:")
    service = OfficeService(repo)
    service.define_area(1, "Conteúdo", "Ana", "")
    return repo, service, TaskWorkflow(repo, llm)


def run(coro):
    return asyncio.run(coro)


def test_approved_delivery_reaches_the_boss_with_team_contributions():
    async def scenario():
        llm = FakeLlm([True])
        repo, service, wf = office(llm)
        service.hire(1, 1, "Bia", "Redatora", "")
        service.hire(1, 4, "Caio", "Designer", "")
        task = wf.delegate("Post", "Escreva um post", 1)
        await wf.wait_idle()
        task = repo.get_task(task.id)
        assert task.status is TaskStatus.DELIVERED
        assert [c.agent_name for c in task.contributions] == ["Bia", "Caio"]
        assert task.reviews[-1].approved
        wf.approve(task.id)
        assert repo.get_task(task.id).status is TaskStatus.APPROVED

    run(scenario())


def test_cos_returns_work_until_it_meets_the_standards():
    async def scenario():
        llm = FakeLlm([False, False, True])
        repo, _, wf = office(llm)
        task = wf.delegate("Post", "Escreva um post", 1)
        await wf.wait_idle()
        task = repo.get_task(task.id)
        assert task.status is TaskStatus.DELIVERED
        assert [r.approved for r in task.reviews] == [False, False, True]
        assert task.deliverable == "entrega v3"  # revised twice before the boss saw it

    run(scenario())


def test_escalates_to_the_boss_after_the_last_review_round():
    async def scenario():
        llm = FakeLlm([False, False, False, True])
        repo, service, wf = office(llm)
        service.update_settings(["padrão"], max_review_rounds=3)
        task = wf.delegate("Post", "Escreva um post", 1)
        await wf.wait_idle()
        assert repo.get_task(task.id).status is TaskStatus.ESCALATED
        wf.request_changes(task.id, "refaça com outro ângulo")
        await wf.wait_idle()
        task = repo.get_task(task.id)
        assert task.status is TaskStatus.DELIVERED
        assert "refaça com outro ângulo" in llm.calls[-2][1]  # the Head saw the boss feedback

    run(scenario())


def test_llm_failure_parks_the_task_and_retry_resumes_it():
    async def scenario():
        llm = FakeLlm(fail_with=LlmError("sem credencial"))
        repo, _, wf = office(llm)
        task = wf.delegate("Post", "Escreva um post", 1)
        await wf.wait_idle()
        task = repo.get_task(task.id)
        assert task.status is TaskStatus.FAILED and task.error == "sem credencial"
        llm.fail_with = None
        wf.retry(task.id)
        await wf.wait_idle()
        assert repo.get_task(task.id).status is TaskStatus.DELIVERED

    run(scenario())


def test_cannot_delegate_to_an_undefined_area_or_hire_into_a_taken_seat():
    async def scenario():
        _, service, wf = office(FakeLlm())
        with pytest.raises(DomainError):
            wf.delegate("Post", "Escreva", 2)
        service.hire(1, 1, "Bia", "Redatora", "")
        with pytest.raises(DomainError):
            service.hire(1, 1, "Caio", "Designer", "")
        with pytest.raises(DomainError):
            service.hire(2, 1, "Caio", "Designer", "")

    run(scenario())
