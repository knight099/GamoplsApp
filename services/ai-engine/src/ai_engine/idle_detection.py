"""Idle-time detection (Phase 8.D.3).

Publishes an AlertRaised (info severity) when an asset's speed stays near
zero for a sustained duration. Reuses the existing AlertRaised event type —
services/chat already turns these into system messages, services/map
already raises them for geofence exits, so no new consumer is needed.

Per CLAUDE.md, this only ever produces an event to publish — it never calls
another service directly.
"""

from __future__ import annotations

from datetime import datetime

from ai_engine.events import AlertRaised, AssetLocationUpdated

IDLE_SPEED_THRESHOLD_KMH = 3.0
IDLE_DURATION_THRESHOLD_MIN = 20.0


class _AssetIdleState:
    def __init__(self, last_moving_at: datetime) -> None:
        self.last_moving_at = last_moving_at
        self.alerted_for_current_episode = False


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


class IdleDetector:
    """Stateful, in-process per-asset idle tracker.

    Not persisted — a service restart resets idle episodes, which is an
    acceptable tradeoff for a V1 alerting nicety (the alert would simply
    re-fire after another full idle duration post-restart, not miss
    anything catastrophic).
    """

    def __init__(self) -> None:
        self._state: dict[str, _AssetIdleState] = {}

    def process_location_update(self, event: AssetLocationUpdated) -> AlertRaised | None:
        speed = event.speed if event.speed is not None else 0.0
        now = _parse_ts(event.timestamp)
        state = self._state.get(event.asset_id)

        if state is None:
            state = _AssetIdleState(last_moving_at=now)
            self._state[event.asset_id] = state

        if speed > IDLE_SPEED_THRESHOLD_KMH:
            state.last_moving_at = now
            state.alerted_for_current_episode = False
            return None

        idle_minutes = (now - state.last_moving_at).total_seconds() / 60.0
        if idle_minutes >= IDLE_DURATION_THRESHOLD_MIN and not state.alerted_for_current_episode:
            state.alerted_for_current_episode = True
            return AlertRaised(
                org_id=event.org_id,
                fleet_id=event.fleet_id,
                timestamp=event.timestamp,
                asset_id=event.asset_id,
                severity="info",
                reason="prolonged_idle",
                message=f"Vehicle {event.asset_id} idle for {int(idle_minutes)} min at ({event.lat}, {event.lng})",
            )

        return None
