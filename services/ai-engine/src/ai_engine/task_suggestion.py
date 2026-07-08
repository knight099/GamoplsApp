"""Phase 5.3 — TaskSuggested publishing when health score crosses a threshold.

Feeds `services/board`'s `TaskSuggested` subscriber. Per CLAUDE.md, this
happens ONLY via the event bus (`EventPublisher.publish`) — never a direct
call into `services/board`.
"""

from __future__ import annotations

from ai_engine.events import (
    ASSET_HEALTH_CHANGED_SUBJECT,
    TASK_SUGGESTED_SUBJECT,
    AssetHealthChanged,
    TaskSuggested,
)
from ai_engine.publisher import EventPublisher

# Below this score, an asset is considered "degraded" and worth a
# maintenance task suggestion. Picked as a reasonable skeleton default, not
# a tuned threshold.
DEGRADED_HEALTH_THRESHOLD = 30.0

SUGGESTION_SOURCE = "ai-engine.health-score"


def build_task_suggestion(event: AssetHealthChanged) -> TaskSuggested:
    """Construct a `TaskSuggested` payload for a degraded-health event."""
    return TaskSuggested(
        org_id=event.org_id,
        fleet_id=event.fleet_id,
        timestamp=event.timestamp,
        asset_id=event.asset_id,
        title=f"Inspect asset {event.asset_id} — health score degraded",
        description=(
            f"Asset {event.asset_id} health score dropped to "
            f"{event.healthScore:.1f}/100 (threshold: "
            f"{DEGRADED_HEALTH_THRESHOLD:.1f}). Telemetry snapshot: "
            f"{event.telemetry!r}"
        ),
        source=SUGGESTION_SOURCE,
    )


def process_and_publish(
    raw_event: AssetHealthChanged,
    publisher: EventPublisher,
    threshold: float = DEGRADED_HEALTH_THRESHOLD,
) -> tuple[AssetHealthChanged, TaskSuggested | None]:
    """Full Phase 5 pipeline for one incoming telemetry event:

    1. Recompute the health score (5.1) from telemetry — never a raw
       passthrough of the input score.
    2. Publish the updated `AssetHealthChanged` event.
    3. If the computed score crosses `threshold`, build and publish a
       `TaskSuggested` event (5.3).

    Returns the updated `AssetHealthChanged` and the `TaskSuggested` (or
    `None` if the score was above threshold), so callers/tests can assert
    on both without re-deriving them from `publisher.published`.
    """
    from ai_engine.health_score import process_health_event

    updated = process_health_event(raw_event)
    publisher.publish(ASSET_HEALTH_CHANGED_SUBJECT, updated.model_dump(mode="json"))

    suggestion: TaskSuggested | None = None
    if updated.healthScore < threshold:
        suggestion = build_task_suggestion(updated)
        publisher.publish(TASK_SUGGESTED_SUBJECT, suggestion.model_dump(mode="json"))

    return updated, suggestion
