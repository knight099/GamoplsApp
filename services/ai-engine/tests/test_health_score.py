from __future__ import annotations

import pytest

from ai_engine.events import AssetHealthChanged
from ai_engine.health_score import compute_health_score, process_health_event


class TestComputeHealthScore:
    @pytest.mark.parametrize(
        "telemetry,expected_min,expected_max",
        [
            # Full battery -> full score.
            ({"battery_pct": 100}, 100.0, 100.0),
            # Empty battery -> zero score.
            ({"battery_pct": 0}, 0.0, 0.0),
            # Mid-range battery -> mid-range score.
            ({"battery_pct": 50}, 49.0, 51.0),
        ],
    )
    def test_battery_pct_scoring(self, telemetry, expected_min, expected_max):
        score = compute_health_score(telemetry)
        assert expected_min <= score <= expected_max

    def test_low_battery_pct_is_degraded(self):
        score = compute_health_score({"battery_pct": 5})
        assert score < 30.0

    def test_no_telemetry_returns_neutral_default(self):
        assert compute_health_score({}) == 100.0

    def test_unknown_fields_are_ignored(self):
        # An asset-type-specific field we don't have a scorer for (e.g. from
        # a future non-vehicle plugin) must not crash scoring, and with no
        # recognized fields present we fall back to the neutral default.
        score = compute_health_score({"sonar_ping_ms": 12})
        assert score == 100.0

    def test_engine_temp_healthy_below_90(self):
        assert compute_health_score({"engine_temp_c": 70}) == 100.0

    def test_engine_temp_degraded_above_130(self):
        assert compute_health_score({"engine_temp_c": 140}) == 0.0

    def test_multiple_fields_are_averaged(self):
        score = compute_health_score({"battery_pct": 100, "fuel_pct": 0})
        assert score == pytest.approx(50.0)

    def test_malformed_value_is_skipped_not_raised(self):
        # A non-numeric value for a known field shouldn't crash the pipeline.
        score = compute_health_score({"battery_pct": "not-a-number"})
        assert score == 100.0  # falls back to neutral default (no valid contributions)


class TestProcessHealthEvent:
    def _make_event(self, **telemetry_overrides) -> AssetHealthChanged:
        return AssetHealthChanged(
            org_id="org-1",
            fleet_id="fleet-1",
            timestamp="2026-07-08T12:00:00.000Z",
            asset_id="asset-1",
            healthScore=1,  # deliberately wrong/stale, must be overwritten
            telemetry=telemetry_overrides,
        )

    def test_recomputes_score_not_passthrough(self):
        event = self._make_event(battery_pct=100)
        updated = process_health_event(event)
        assert updated.healthScore != 1
        assert updated.healthScore == 100.0

    def test_battery_degraded_event_produces_low_score(self):
        event = self._make_event(battery_pct=10)
        updated = process_health_event(event)
        assert updated.healthScore < 30.0

    def test_preserves_identity_fields(self):
        event = self._make_event(battery_pct=50)
        updated = process_health_event(event)
        assert updated.org_id == event.org_id
        assert updated.fleet_id == event.fleet_id
        assert updated.asset_id == event.asset_id
        assert updated.type == "AssetHealthChanged"

    def test_returns_new_event_not_same_object(self):
        event = self._make_event(battery_pct=50)
        updated = process_health_event(event)
        assert updated is not event
