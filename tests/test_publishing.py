import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.application.ports import PublishError
from app.application.publishing import PublishingService
from app.domain.errors import DomainError, InvalidTransition
from app.domain.models import Channel, PublicationStatus, Task, TaskStatus
from app.infrastructure.social import NoConnectedAccounts
from app.infrastructure.sqlite_repository import SqliteOfficeRepository

NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)


class FakeNetwork:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.posted: list[str] = []

    def connected(self, channel: Channel) -> bool:
        return channel is Channel.LINKEDIN

    async def publish(self, publication) -> str:
        if self.fail:
            raise PublishError("token expirado")
        self.posted.append(publication.text)
        return "https://linkedin.example/post/1"


def setup(publisher, approved=True):
    repo = SqliteOfficeRepository(":memory:")
    task = Task(id="t1", title="Post", briefing="b", area_id=1, status=TaskStatus.APPROVED if approved else TaskStatus.DELIVERED)
    repo.save_task(task)
    return repo, PublishingService(repo, publisher)


def at(minutes: int) -> str:
    return (NOW + timedelta(minutes=minutes)).isoformat()


def test_only_approved_deliveries_can_be_scheduled():
    _, service = setup(NoConnectedAccounts(), approved=False)
    with pytest.raises(DomainError):
        service.schedule("t1", "linkedin", "texto", at(10))


def test_rejects_unknown_network_and_naive_dates():
    _, service = setup(NoConnectedAccounts())
    with pytest.raises(DomainError):
        service.schedule("t1", "tiktok", "texto", at(10))
    with pytest.raises(DomainError):
        service.schedule("t1", "linkedin", "texto", "2026-11-17T12:00:00")


def test_connected_network_posts_automatically_when_due():
    network = FakeNetwork()
    repo, service = setup(network)
    later = service.schedule("t1", "linkedin", "agora não", at(30))
    due = service.schedule("t1", "linkedin", "agora sim", at(-1))
    assert asyncio.run(service.run_due(NOW)) == 1
    assert repo.get_publication(due.id).status is PublicationStatus.PUBLISHED
    assert repo.get_publication(due.id).url == "https://linkedin.example/post/1"
    assert repo.get_publication(later.id).status is PublicationStatus.SCHEDULED
    assert network.posted == ["agora sim"]


def test_network_without_account_goes_to_the_ready_queue_for_a_person():
    repo, service = setup(FakeNetwork())
    pub = service.schedule("t1", "instagram", "texto", at(-1))
    asyncio.run(service.run_due(NOW))
    assert repo.get_publication(pub.id).status is PublicationStatus.READY
    service.mark_published(pub.id, "https://instagram.example/p/1")
    assert repo.get_publication(pub.id).status is PublicationStatus.PUBLISHED
    with pytest.raises(InvalidTransition):
        service.cancel(pub.id)


def test_failed_post_can_be_retried():
    network = FakeNetwork(fail=True)
    repo, service = setup(network)
    pub = service.schedule("t1", "linkedin", "texto", at(-1))
    asyncio.run(service.run_due(NOW))
    failed = repo.get_publication(pub.id)
    assert failed.status is PublicationStatus.FAILED and failed.error == "token expirado"
    network.fail = False
    service.retry(pub.id)
    asyncio.run(service.run_due(datetime.now(timezone.utc) + timedelta(seconds=5)))
    assert repo.get_publication(pub.id).status is PublicationStatus.PUBLISHED
