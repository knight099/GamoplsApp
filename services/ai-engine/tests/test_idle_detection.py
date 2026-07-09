from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ai_engine.events import AssetLocationUpdated
from ai_engine.idle_detection import IdleDetector


def _ts(minutes_from_epoch: int) -> str:
    base = datetime(2026, 7, 10, 0, 0, 0, tzinfo=timezone.utc)
    return (base + timedelta(minutes=minutes_from_epoch)).isoformat()


def _event(asset_id: str, minute: int, speed: float) -> AssetLocationUpdated:
    return AssetLocationUpdated(
        org_id="org-1",
        fleet_id="fleet-1",
        timestamp=_ts(minute),
        asset_id=asset_id,
        lat=13.08,
        lng=80.27,
        speed=speed,
    )


class TestIdleDetector:
    def test_no_alert_while_moving(self):
        detector = IdleDetector()
        assert detector.process_location_update(_event("v1", 0, 40)) is None
        assert detector.process_location_update(_event("v1", 5, 35)) is None

    def test_no_alert_before_duration_threshold(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        assert detector.process_location_update(_event("v1", 10, 0)) is None  # only 10 min idle

    def test_alerts_once_after_sustained_idle(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        detector.process_location_update(_event("v1", 5, 0))
        alert = detector.process_location_update(_event("v1", 26, 0))  # 21 min since last moving
        assert alert is not None
        assert alert.severity == "info"
        assert alert.reason == "prolonged_idle"
        assert "v1" in alert.message or "idle" in alert.message.lower()

        # Should not re-alert on the next tick while still idle.
        assert detector.process_location_update(_event("v1", 30, 0)) is None

    def test_new_episode_alerts_again_after_moving_then_idling(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        detector.process_location_update(_event("v1", 5, 0))
        assert detector.process_location_update(_event("v1", 26, 0)) is not None  # first alert
        detector.process_location_update(_event("v1", 27, 40))  # moving again — new episode starts
        detector.process_location_update(_event("v1", 28, 0))
        second_alert = detector.process_location_update(_event("v1", 49, 0))  # 21 min idle again
        assert second_alert is not None

    def test_tracks_assets_independently(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 0))
        alert = detector.process_location_update(_event("v2", 0, 40))
        assert alert is None
