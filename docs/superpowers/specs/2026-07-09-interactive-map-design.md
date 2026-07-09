# Interactive Map with Clickable Markers — Design

## Context

Sub-project B of the Phase 8 fleet-ops UX plan (see `PLAN.md`). `MapView` today (`apps/web/components/map/MapView.tsx`) renders asset positions as a plain table (`AssetPositionsTable`) — a deliberate V1 simplification, per that component's own doc comment: "Wiring up a real map (Leaflet/Mapbox) needs an external tile provider/API key and is out of scope here."

Both backends this needs already exist and require no changes:
- `services/map`'s `GET /fleets/:fleetId/positions` already returns `AssetMarker[]` (id, icon, label, lat, lng, heading, speed, positionUpdatedAt).
- `services/map`'s `GET /geofences` already returns circular geofences (center + radius) — already fetched and rendered as a list by `GeofencePanel`.
- `services/fleet`'s `GET /assets` (built in sub-project A) already returns each asset's `health_score`, `telemetry` (fuel_pct, battery_pct, etc.), and nested `vehicleDetails.odometerKm`.

So this sub-project is **frontend-only**: render a real Leaflet map, join the two existing data sources client-side by asset id, and add a marker-click popup + a "more details" entry point.

## Goals

1. Replace the map page's flat table with an actual interactive map (Leaflet + OpenStreetMap tiles, no API key required) — keep the existing table below it as a secondary view, don't remove working functionality.
2. Clicking a vehicle's marker shows a popup with a quick overview: label, health score, fuel level, odometer.
3. Geofences render as circles on the map (radius + center), matching the data already shown in `GeofencePanel`'s list.
4. Popup has a "More details" link that navigates to a per-vehicle detail page — a minimal stub for now, since the full "digital twin" dashboard is sub-project C's job; this just establishes the entry point C will build on.

## Non-goals

- No digital twin / advanced diagnostics visualization (sub-project C).
- No backend changes — `services/map` and `services/fleet` already expose everything needed.
- No route drawing / trip playback / clustering — out of scope for V1.
- Marker icons stay generic (a colored dot, tone-matched to health score, reusing the existing `healthTone()` pattern from `VehiclesTable.tsx`) rather than per-vehicle-type images — `asset.getMapIcon()` returns an opaque string per CLAUDE.md's "never branch on asset type" rule, so the frontend must not special-case it into a specific icon image.

## Design

### Library: Leaflet + `react-leaflet` + OpenStreetMap tiles

Free, no API key/billing (fits the cost-conscious framing already established for this platform), and the standard React wrapper. Leaflet needs `window`/DOM at import time, so the map component must be a client component loaded via `next/dynamic` with `ssr: false`.

### Data join (client-side composition, not a new backend concern)

`MapView` already fetches `AssetMarker[]` from `services/map` via `fetchFleetPositions`. It will additionally fetch `Asset[]` from `services/fleet` via the existing `listVehicles()` (from sub-project A's `components/fleet/api.ts`) and join the two by `id` client-side — this is exactly the kind of "sync read across services, not a state-propagating write" that CLAUDE.md's event-bus rule explicitly permits (the rule is about services calling each other, not about `apps/web` composing two read APIs for a dashboard view). If an asset has a position but no matching fleet record (e.g. not yet onboarded), the marker still renders with label-only, no popup health data — must degrade gracefully, not crash or omit the marker.

### Marker appearance

A `divIcon` colored via the existing `healthTone()` logic (green ≥80, amber ≥50, red below) — no image assets, no per-vehicle-type icon set. Consistent with the "no branching on asset type" rule and avoids Next.js's known Leaflet-default-icon-path issue entirely (using `divIcon` sidesteps needing to fix `L.Icon.Default`'s broken asset resolution under bundlers, a well-known Leaflet+webpack/Next gotcha).

### Popup content

Label, a health-score badge, fuel % (from `telemetry.fuel_pct` if present, else "—"), odometer (from `vehicleDetails.odometerKm` if present, else "—"), and a "More details" link to `/fleet/vehicles/:id`.

### "More details" stub page

`apps/web/app/fleet/vehicles/[id]/page.tsx` — a minimal read-only view (not the digital twin) showing the full `Asset` + `vehicleDetails` fields already available from `GET /assets/:id`, plus current driver assignment (from `GET /assets/:id/assignments`, already built in sub-project A). This is the "more details" experience for V1 and the page sub-project C will later enhance with the digital twin visualization — same route, richer content added later, not a new route.

### Geofences

`MapCanvas` also renders each geofence from `GeofencePanel`'s existing data fetch as a `<Circle center radius>` — reuses data already being fetched, no new API calls.

## Testing

- Component tests for the map wrapper mock `react-leaflet` (standard practice — Leaflet doesn't run in jsdom) and assert marker count, popup content composition, and graceful degradation when fleet data is missing for an asset.
- Existing `MapView.test.tsx`/`AssetPositionsTable.test.tsx` continue passing unchanged (table stays).
- New test for the vehicle-detail stub page (loading/error/success states, matching the existing `BoardView`-style pattern).
