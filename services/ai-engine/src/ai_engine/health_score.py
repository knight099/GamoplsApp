"""Health score computation (Phase 5.1).

Takes a raw/partial telemetry snapshot for an asset, computes a 0-100 health
score, and constructs an updated `AssetHealthChanged` event carrying that
score — never a raw passthrough of the input event.

Per CLAUDE.md: this must work generically off telemetry fields, never branch
on asset type (`if asset.type == "vehicle"`). The scoring function below
only looks at well-known *telemetry field names* (battery_pct, engine_temp_c,
fuel_pct, tire_pressure_psi, ...) that any asset plugin may or may not
populate — it has no notion of "vehicle" as a concept. Unknown/missing
fields are simply skipped, which keeps this open to non-vehicle asset types
(drones, vessels, etc.) that will populate a different subset of fields.
"""

from __future__ import annotations

from typing import Any

from ai_engine.events import AssetHealthChanged

# Each telemetry field maps to a scoring rule: (field_name, score_fn).
# score_fn takes the raw value and returns a 0-100 contribution. A field
# that's absent from telemetry simply doesn't contribute — this is what
# keeps the function generic across asset types instead of hardcoding
# "a vehicle must have battery_pct".


def _score_battery_pct(value: float) -> float:
    """Battery percentage: linear, 0% -> 0, 100% -> 100."""
    return max(0.0, min(100.0, float(value)))


def _score_fuel_pct(value: float) -> float:
    """Fuel percentage: linear, 0% -> 0, 100% -> 100."""
    return max(0.0, min(100.0, float(value)))


def _score_engine_temp_c(value: float) -> float:
    """Engine temperature: healthy under 90C, degrades linearly to 0 at 130C."""
    value = float(value)
    if value <= 90:
        return 100.0
    if value >= 130:
        return 0.0
    return 100.0 * (130 - value) / (130 - 90)


def _score_tire_pressure_psi(value: float) -> float:
    """Tire pressure: healthy in [28, 36] psi, degrades linearly outside that band."""
    value = float(value)
    low, high = 28.0, 36.0
    if low <= value <= high:
        return 100.0
    distance = (low - value) if value < low else (value - high)
    # Fully degraded once 15psi out of band in either direction.
    return max(0.0, 100.0 * (1 - distance / 15.0))


TELEMETRY_SCORERS: dict[str, Any] = {
    "battery_pct": _score_battery_pct,
    "fuel_pct": _score_fuel_pct,
    "engine_temp_c": _score_engine_temp_c,
    "tire_pressure_psi": _score_tire_pressure_psi,
}

# Score returned when telemetry has no fields we recognize at all — neutral,
# neither "healthy" nor "degraded", since we have no signal either way.
DEFAULT_SCORE_NO_TELEMETRY = 100.0


def compute_health_score(telemetry: dict[str, Any]) -> float:
    """Compute a 0-100 health score from a telemetry dict.

    Generic across asset types: only inspects whichever of
    `TELEMETRY_SCORERS`'s keys happen to be present in `telemetry`. If none
    are present, returns a neutral default rather than assuming failure.
    """
    contributions: list[float] = []
    for field, scorer in TELEMETRY_SCORERS.items():
        if field not in telemetry or telemetry[field] is None:
            continue
        try:
            contributions.append(scorer(telemetry[field]))
        except (TypeError, ValueError):
            # Malformed telemetry value for a known field: skip it rather
            # than crash the scoring pipeline.
            continue

    if not contributions:
        return DEFAULT_SCORE_NO_TELEMETRY

    score = sum(contributions) / len(contributions)
    return round(max(0.0, min(100.0, score)), 2)


def process_health_event(event: AssetHealthChanged) -> AssetHealthChanged:
    """Recompute the health score for an incoming (possibly partial/raw)
    `AssetHealthChanged` event and return a NEW event with the computed
    score — not a passthrough of `event.healthScore`.

    The incoming event's `telemetry` is treated as the source of truth for
    scoring; `healthScore` on the input is ignored/overwritten, since the
    whole point of this function is to (re)compute it.
    """
    computed = compute_health_score(event.telemetry)
    return AssetHealthChanged(
        org_id=event.org_id,
        fleet_id=event.fleet_id,
        timestamp=event.timestamp,
        asset_id=event.asset_id,
        healthScore=computed,
        telemetry=event.telemetry,
    )
