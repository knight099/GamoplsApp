"""Phase 5.2 — LangGraph agent skeleton.

Explicitly a SINGLE-NODE no-op passthrough stub, meant to be grown into a
real predictive-maintenance agent later. Don't add more nodes/logic here —
that's the next phase's job, not this skeleton's.

If `langgraph` is importable, we build a real (trivial) `StateGraph` with
one passthrough node. If it isn't installed (it's an optional extra — see
pyproject.toml `[project.optional-dependencies].langgraph`), we fall back to
a plain-Python mock with the identical call signature, so tests never
require `langgraph`/network access to any model API. No real LLM calls
happen in either path — this is infrastructure only.
"""

from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    """State shape flowing through the graph.

    Deliberately minimal: an asset_id, the telemetry snapshot, and the
    health score computed by `health_score.py`. Later phases will extend
    this state and add nodes (e.g. "diagnose", "recommend") without
    touching this passthrough node's contract.
    """

    asset_id: str
    telemetry: dict[str, Any]
    healthScore: float


def _passthrough_node(state: AgentState) -> AgentState:
    """The one node in this skeleton graph: returns state unchanged.

    This is intentionally a no-op — the graph exists so later phases have a
    place to add real nodes (diagnosis, recommendation, tool calls) without
    restructuring the caller's contract.
    """
    return dict(state)  # type: ignore[return-value]


try:
    from langgraph.graph import END, StateGraph  # type: ignore[import-not-found]

    _LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only when langgraph is absent
    _LANGGRAPH_AVAILABLE = False


def build_health_agent_graph() -> Any:
    """Build the single-node LangGraph graph, or a mock with the same
    `.invoke(state) -> state` interface if `langgraph` isn't installed.
    """
    if not _LANGGRAPH_AVAILABLE:
        return _MockGraph()

    graph = StateGraph(AgentState)
    graph.add_node("passthrough", _passthrough_node)
    graph.set_entry_point("passthrough")
    graph.add_edge("passthrough", END)
    return graph.compile()


class _MockGraph:
    """Fallback used when `langgraph` isn't installed.

    Mirrors the subset of the compiled-graph interface this codebase
    relies on (`.invoke`), so callers don't need to branch on whether
    `langgraph` is present.
    """

    def invoke(self, state: AgentState) -> AgentState:
        return _passthrough_node(state)


def run_agent_skeleton(state: AgentState) -> AgentState:
    """Convenience entrypoint: build the graph and run it once on `state`."""
    graph = build_health_agent_graph()
    return graph.invoke(state)
