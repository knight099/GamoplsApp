"""Transport-agnostic event publisher port (DIP), mirroring
`packages/event-schemas/src/ports.ts::EventPublisher`.

This module MUST NOT import `nats` (or any transport library) at module
scope, so it stays importable/testable with zero network dependencies. The
NATS-backed implementation is provided as an optional, lazily-imported
adapter below.

Per CLAUDE.md: services communicate only via the event bus, never direct
service-to-service calls. `services/ai-engine` publishes `AssetHealthChanged`
and `TaskSuggested`; it never calls into `services/board` or
`services/map` directly.
"""

from __future__ import annotations

from typing import Protocol


class EventPublisher(Protocol):
    """Port that any transport adapter (NATS, in-memory, etc.) implements."""

    def publish(self, subject: str, payload: dict) -> None:
        """Publish a payload under the given subject/topic.

        The payload should already have been validated (e.g. constructed
        from a Pydantic model and `.model_dump(mode="json")`'d) by the
        caller before this is invoked — mirrors the TS port's contract.
        """
        ...


class InMemoryEventPublisher:
    """Simple no-network publisher for tests and local dev.

    Records every published (subject, payload) pair so tests can assert on
    what WOULD have been published without standing up NATS.
    """

    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    def publish(self, subject: str, payload: dict) -> None:
        self.published.append((subject, payload))


class NatsEventPublisher:
    """NATS-backed `EventPublisher`, using `nats-py`.

    Optional: only import-able if the `nats` extra is installed
    (`pip install ai-engine[nats]` / `uv sync --extra nats`). Kept minimal —
    this is infrastructure scaffolding for later phases, not exercised by
    the unit tests in this skeleton (those use `InMemoryEventPublisher`).
    """

    def __init__(self, nats_url: str = "nats://localhost:4222") -> None:
        self._nats_url = nats_url
        self._nc = None

    async def connect(self) -> None:
        import nats  # noqa: PLC0415 — intentionally lazy/optional import

        self._nc = await nats.connect(self._nats_url)

    async def publish_async(self, subject: str, payload: dict) -> None:
        import json

        if self._nc is None:
            await self.connect()
        assert self._nc is not None
        await self._nc.publish(subject, json.dumps(payload).encode("utf-8"))

    def publish(self, subject: str, payload: dict) -> None:
        """Sync-signature shim satisfying `EventPublisher`.

        Real usage in an async NATS service should call `publish_async`
        directly instead; this exists only so `NatsEventPublisher` can be
        passed anywhere an `EventPublisher` is expected.
        """
        import asyncio

        asyncio.run(self.publish_async(subject, payload))
