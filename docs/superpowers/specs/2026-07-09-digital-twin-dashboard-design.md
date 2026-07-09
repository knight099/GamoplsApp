# Digital Twin Vehicle Dashboard — Design

## Context

Sub-project C of the Phase 8 fleet-ops UX plan (see `PLAN.md`) — the final piece of the original "click a marker → more details → digital twin" request. `apps/web/app/fleet/vehicles/[id]/page.tsx` already exists as a stub (built in sub-project B) showing aggregate health, plate/type/odometer, and current driver assignment. This sub-project enhances that same route — not a new route — with a visual "digital twin": a vehicle silhouette with colored hotspots per component.

**Honesty constraint driving this design**: the Edge Box telemetry pipeline (`plugins/ingestion-edgebox`) only ever sends four named readings today — `battery_pct`, `engine_temp_c`, `fuel_pct`, `odometer_km` — plus one aggregate `health_score`. There is no per-component sensor data (no brake-wear sensor, no tire-pressure sensor, etc.). The digital twin must only show hotspots for readings that actually exist, never invent placeholder health for components with no backing data — this was an explicit scope decision to avoid the dashboard looking more sophisticated than the underlying data supports.

## Goals

1. Replace the flat "Health {score}" badge on the vehicle detail page with a vehicle silhouette diagram showing colored hotspots at fixed positions: **Engine**, **Battery**, **Fuel**, **Overall**.
2. Each hotspot's color (green/amber/red) is driven by its own telemetry reading and its own thresholds — not all four collapsed to the single aggregate `health_score`.
3. Clicking/hovering a hotspot shows the specific reading (e.g. "Engine: 91°C — Normal") in a tooltip/popover.
4. Everything else already on the page (plate/type/odometer, driver assignment) stays as-is — this sub-project only replaces the health-badge section.

## Non-goals

- No per-component sensor ingestion changes — this is a frontend-only visualization of data that already exists. If a future Edge Box firmware or a new sensor plugin (per Phase 8.D) adds tire-pressure or brake-wear telemetry, extending the hotspot list is a small follow-up, not part of this scope.
- No 3D model, no animation — a static SVG silhouette with positioned markers.
- No historical trend charts (health-over-time) — out of scope, current-snapshot only.

## Design

### Visual: static SVG vehicle silhouette + positioned hotspot markers

A simple side-view vehicle outline (generic car/van silhouette — the same silhouette regardless of `vehicleDetails.vehicleType`, since building type-specific art for truck/van/car/bike/bus is unnecessary polish for V1 and the hotspot *positions* — engine at front, fuel mid-body, battery front, overall center — are close enough across types to not need per-type art). Four `<circle>` markers overlaid at fixed `(x, y)` coordinates on the SVG viewbox, color-filled per the same `healthTone()` pattern already used elsewhere in this codebase.

### Hotspot → telemetry mapping and thresholds

A small config array, each entry independently deciding whether it has data to show at all:

| Hotspot | Telemetry key | Thresholds (green / amber / red) | Label format |
|---|---|---|---|
| Engine | `telemetry.engine_temp_c` | ≤95°C / ≤110°C / >110°C | "Engine: {v}°C" |
| Battery | `telemetry.battery_pct` | ≥50% / ≥25% / <25% | "Battery: {v}%" |
| Fuel | `telemetry.fuel_pct` | ≥30% / ≥10% / <10% | "Fuel: {v}%" |
| Overall | `asset.health_score` (always present, has a default of 100) | ≥80 / ≥50 / <50 | "Overall: {v}" |

If a telemetry key is absent (`typeof value !== "number"`), that hotspot renders in a neutral gray with a "No data" label instead of being omitted entirely — keeps the four-position layout visually stable rather than have hotspots appear/disappear as telemetry arrives/expires.

### Interaction

Each hotspot is a `<circle>` with a `title` SVG element (native browser tooltip on hover — no new tooltip library needed) plus an `onClick` that shows the same text in a small popover/inline detail row below the diagram (for touch devices where hover tooltips don't work — this is likely used on a tablet in a vehicle, per the platform's stated use case).

## Testing

- Component test asserting all four hotspots render with correct tone/color when all telemetry present.
- Test asserting graceful "No data" rendering when telemetry is missing one or more of the three named keys (matches the honesty constraint above).
- Existing vehicle-detail-page test (loading/error/success) continues passing, extended to cover the new hotspot section instead of the old flat badge.
