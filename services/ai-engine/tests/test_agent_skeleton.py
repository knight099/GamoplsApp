from __future__ import annotations

from ai_engine.agent_skeleton import build_health_agent_graph, run_agent_skeleton


class TestAgentSkeleton:
    def test_graph_builds_without_error(self):
        graph = build_health_agent_graph()
        assert graph is not None

    def test_passthrough_state_in_state_out(self):
        state = {"asset_id": "vehicle-42", "telemetry": {"battery_pct": 80}, "healthScore": 80.0}
        result = run_agent_skeleton(state)

        assert result["asset_id"] == "vehicle-42"
        assert result["telemetry"] == {"battery_pct": 80}
        assert result["healthScore"] == 80.0

    def test_passthrough_does_not_mutate_input_identity(self):
        state = {"asset_id": "vehicle-1", "telemetry": {}, "healthScore": 50.0}
        result = run_agent_skeleton(state)
        assert result == state
