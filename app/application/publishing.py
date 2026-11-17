"""Social publishing: approved deliveries are scheduled per network and posted when their time comes.

A network with a connected account is posted automatically; otherwise the post moves to "ready" and a
person publishes it and marks it as published. Nothing is posted without the Big Boss's approval.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.domain.models import Publication

from .ports import OfficeRepository, PublishError, SocialPublisher

log = logging.getLogger(__name__)


class PublishingService:
    def __init__(self, repo: OfficeRepository, publisher: SocialPublisher) -> None:
        self._repo = repo
        self._publisher = publisher

    def schedule(self, task_id: str, channel: str, text: str, scheduled_at: str) -> Publication:
        publication = Publication.schedule(self._repo.get_task(task_id), channel, text, scheduled_at)
        self._repo.save_publication(publication)
        return publication

    def mark_published(self, publication_id: str, url: str) -> Publication:
        return self._change(publication_id, lambda p: p.mark_published(url))

    def retry(self, publication_id: str) -> Publication:
        return self._change(publication_id, lambda p: p.retry())

    def cancel(self, publication_id: str) -> Publication:
        return self._change(publication_id, lambda p: p.cancel())

    async def run_due(self, now: datetime | None = None) -> int:
        """Handles every publication whose time has come. Returns how many were handled."""
        now = now or datetime.now(timezone.utc)
        due = [p for p in self._repo.list_publications() if p.is_due(now)]
        for publication in due:
            if not self._publisher.connected(publication.channel):
                publication.mark_ready()
            else:
                try:
                    publication.mark_published(await self._publisher.publish(publication))
                except PublishError as exc:
                    publication.fail(str(exc))
                except Exception:  # noqa: BLE001 - a broken connector must not stop the queue
                    log.exception("Unexpected failure publishing %s", publication.id)
                    publication.fail("Erro inesperado ao publicar. Veja o log do servidor.")
            self._repo.save_publication(publication)
        return len(due)

    def _change(self, publication_id: str, mutate) -> Publication:
        publication = self._repo.get_publication(publication_id)
        mutate(publication)
        self._repo.save_publication(publication)
        return publication

