"""Social network adapters.

No account is connected yet: connecting one needs the network's API credentials and the account
owners' approval (see README, "Publicação nas redes"). Until then every post goes to the
"ready to publish" queue.
"""
from __future__ import annotations

from app.application.ports import PublishError
from app.domain.models import Channel, Publication


class NoConnectedAccounts:
    def connected(self, channel: Channel) -> bool:
        return False

    async def publish(self, publication: Publication) -> str:
        raise PublishError(f"Nenhuma conta de {publication.channel.value} conectada.")

    def describe(self) -> dict:
        return {"connected": []}
