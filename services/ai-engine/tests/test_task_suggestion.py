from __future__ import annotations

from ai_engine.events import (
    ASSET_HEALTH_CHANGED_SUBJECT,
    ASSET_HEALTH_RAW_SUBJECT,
    TASK_SUGGESTED_SUBJECT,
    AssetHealthChanged,
)
from ai_engine.publisher import InMemoryEventPublisher
from ai_engine.task_suggestion import (
    DEGRADED_HEALTH_THRESHOLD,
    build_task_suggestion,
    process_and_publish,
)


def _make_raw_event(**telemetry_overrides) -> AssetHealthChanged:
    return AssetHealthChanged(
        org_id="org-1",
        fleet_id="fleet-1",
        timestamp="2026-07-08T12:00:00.000Z",
        asset_id="vehicle-42",
        healthScore=0,  # ignored — process_and_publish recomputes it
        telemetry=telemetry_overrides,
    )


class TestBuildTaskSuggestion:
    def test_field_shape_matches_task_suggested_schema(self):
        event = AssetHealthChanged(
            org_id="org-1",
            fleet_id="fleet-1",
            timestamp="2026-07-08T12:00:00.000Z",
            asset_id="vehicle-42",
            healthScore=12.5,
            telemetry={"battery_pct": 12.5},
        )
        suggestion = build_task_suggestion(event)

        assert suggestion.type == "TaskSuggested"
        assert suggestion.org_id == "org-1"
        assert suggestion.fleet_id == "fleet-1"
        assert suggestion.asset_id == "vehicle-42"
        assert suggestion.source == "ai-engine.health-score"
        assert "vehicle-42" in suggestion.title
        assert suggestion.description  # non-empty, per schema min length 1


class TestProcessAndPublish:
    def test_below_threshold_publishes_both_events(self):
        publisher = InMemoryEventPublisher()
        raw = _make_raw_event(battery_pct=5)  # -> low score

        updated, suggestion = process_and_publish(raw, publisher)

        assert updated.healthScore < DEGRADED_HEALTH_THRESHOLD
        assert suggestion is not None

        subjects = [subject for subject, _ in publisher.published]
        assert subjects == [ASSET_HEALTH_CHANGED_SUBJECT, TASK_SUGGESTED_SUBJECT]

    def test_above_threshold_does_not_publish_task_suggested(self):
        publisher = InMemoryEventPublisher()
        raw = _make_raw_event(battery_pct=95)  # -> high score

        updated, suggestion = process_and_publish(raw, publisher)

        assert updated.healthScore >= DEGRADED_HEALTH_THRESHOLD
        assert suggestion is None

        subjects = [subject for subject, _ in publisher.published]
        assert subjects == [ASSET_HEALTH_CHANGED_SUBJECT]

    def test_published_payload_has_expected_keys(self):
        publisher = InMemoryEventPublisher()
        raw = _make_raw_event(battery_pct=5)

        process_and_publish(raw, publisher)

        health_subject, health_payload = publisher.published[0]
        assert health_subject == ASSET_HEALTH_CHANGED_SUBJECT
        assert set(health_payload.keys()) == {
            "org_id",
            "fleet_id",
            "timestamp",
            "type",
            "asset_id",
            "healthScore",
            "telemetry",
        }

        task_subject, task_payload = publisher.published[1]
        assert task_subject == TASK_SUGGESTED_SUBJECT
        assert set(task_payload.keys()) == {
            "org_id",
            "fleet_id",
            "timestamp",
            "type",
            "asset_id",
            "title",
            "description",
            "source",
        }

    def test_custom_threshold_is_respected(self):
        publisher = InMemoryEventPublisher()
        raw = _make_raw_event(battery_pct=50)  # score ~50

        _, suggestion = process_and_publish(raw, publisher, threshold=60.0)
        assert suggestion is not None

    def test_scored_telemetry_passes_through_unpolluted(self):
        """The published scored event carries the input telemetry verbatim —
        no `_processed_by_ai` (or any other) marker injected. The raw/scored
        subject split made the loop-breaker marker unnecessary."""
        publisher = InMemoryEventPublisher()
        telemetry = {"battery_pct": 5, "odometer_km": 12345}
        raw = _make_raw_event(**telemetry)

        process_and_publish(raw, publisher)

        _, health_payload = publisher.published[0]
        assert "_processed_by_ai" not in health_payload["telemetry"]
        assert health_payload["telemetry"] == telemetry

    def test_never_publishes_on_the_raw_subject_it_consumes(self):
        """Loop safety without markers: ai-engine consumes `AssetHealthRaw`
        and publishes only on the scored/suggestion subjects, so it can
        never receive its own output."""
        assert ASSET_HEALTH_RAW_SUBJECT != ASSET_HEALTH_CHANGED_SUBJECT

        publisher = InMemoryEventPublisher()
        process_and_publish(_make_raw_event(battery_pct=5), publisher)

        subjects = {subject for subject, _ in publisher.published}
        assert ASSET_HEALTH_RAW_SUBJECT not in subjects
        assert subjects == {ASSET_HEALTH_CHANGED_SUBJECT, TASK_SUGGESTED_SUBJECT}
