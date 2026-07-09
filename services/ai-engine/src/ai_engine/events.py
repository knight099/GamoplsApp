"""Pydantic event models mirroring `packages/event-schemas` (TypeScript/zod).

This is a deliberate re-implementation, not a shared import: per CLAUDE.md,
plugins/services are separate deployable processes and never share
in-process code across languages. Field names and JSON shapes here MUST stay
in lockstep with `packages/event-schemas/src/events/*.ts` by hand — if you
change a field here, check the TS schema (and vice versa).

Source of truth checked against (2026-07-10):
  packages/event-schemas/src/common.ts
  packages/event-schemas/src/events/asset-health-changed.ts
  packages/event-schemas/src/events/task-suggested.ts
  packages/event-schemas/src/events/asset-location-updated.ts
  packages/event-schemas/src/events/alert-raised.ts
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def _now_iso() -> str:
    """ISO 8601 timestamp, matching zod's `z.string().datetime()` expectation."""
    return datetime.now(timezone.utc).isoformat()


class BaseEvent(BaseModel):
    """Fields every event carries — mirrors `common.ts::baseEventSchema`.

    Per CLAUDE.md's multi-tenancy rule: every event is scoped by
    org_id/fleet_id.
    """

    org_id: str
    fleet_id: str
    # ISO 8601 timestamp of when the event occurred (not when it was published).
    timestamp: str = Field(default_factory=_now_iso)


class AssetHealthChanged(BaseEvent):
    """Mirrors `asset-health-changed.ts::assetHealthChangedSchema`."""

    type: Literal["AssetHealthChanged"] = "AssetHealthChanged"
    asset_id: str
    healthScore: float = Field(ge=0, le=100)
    # Plugin-defined telemetry snapshot. Consumers treat this as opaque.
    telemetry: dict[str, Any] = Field(default_factory=dict)


class TaskSuggested(BaseEvent):
    """Mirrors `task-suggested.ts::taskSuggestedSchema`."""

    type: Literal["TaskSuggested"] = "TaskSuggested"
    # The Taskable asset this suggestion is for.
    asset_id: str
    title: str
    description: str
    # What produced the suggestion, e.g. "ai-engine.health-score".
    source: str


class AssetLocationUpdated(BaseEvent):
    """Mirrors `asset-location-updated.ts::assetLocationUpdatedSchema`."""

    type: Literal["AssetLocationUpdated"] = "AssetLocationUpdated"
    asset_id: str
    lat: float
    lng: float
    heading: float | None = None
    speed: float | None = None


class AlertRaised(BaseEvent):
    """Mirrors `alert-raised.ts::alertRaisedSchema`."""

    type: Literal["AlertRaised"] = "AlertRaised"
    asset_id: str
    severity: Literal["info", "warning", "critical"]
    reason: str
    message: str


# Subject names used when publishing — kept alongside the models since the
# event type literal (`type` field) and the pub/sub subject are related but
# not always identical in a real NATS deployment (subjects often include
# additional routing segments). For this skeleton, subject == event type.
ASSET_HEALTH_CHANGED_SUBJECT = "AssetHealthChanged"
TASK_SUGGESTED_SUBJECT = "TaskSuggested"
ASSET_LOCATION_UPDATED_SUBJECT = "AssetLocationUpdated"
ALERT_RAISED_SUBJECT = "AlertRaised"
