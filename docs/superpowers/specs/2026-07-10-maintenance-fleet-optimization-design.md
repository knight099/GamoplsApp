# Maintenance & Fleet Optimization — Design

## Context

Sub-project D of the Phase 8 fleet-ops UX plan (see `PLAN.md`). This is the "actually save money" layer originally requested: know when a vehicle needs service before it breaks, and see fuel/idle waste. Scoped down from three bundled ideas (see `PLAN.md`'s 8.D) to the two concrete, buildable pieces — **multi-sensor plugin extensibility needs no new code** (already covered below) — plus fuel efficiency, which the user asked to include despite its complexity.

Three existing pieces of infrastructure make this buildable without new architecture:
- `services/fleet` (sub-project A) already subscribes to `AssetHealthChanged` and persists the latest `telemetry`/`health_score` snapshot per `Asset`, and already has a `VehiclePluginClient` talking to `plugins/asset-vehicle` over HTTP.
- `services/ai-engine` (`PLAN.md` Phase 5) already subscribes to `AssetHealthChanged`, recomputes health scores generically off telemetry field names, and publishes `TaskSuggested` when a score crosses a threshold — the exact pattern this sub-project reuses for "service due" suggestions.
- `AlertRaised` (already in `packages/event-schemas`, already consumed by `services/chat` to auto-post system messages and by `services/map` for geofence exits) is the right event type for idle-time notices — no new event schema needed, just a new publisher.

### Multi-sensor plugin extensibility — no new code needed

`Monitorable.telemetry` (`packages/asset-contracts`) is already an opaque `Record<string, unknown>` specifically so a camera/dashcam/independent-GPS Ingestion Plugin can publish its own fields into the same `AssetHealthChanged` event without any module service change — `services/fleet`'s `Asset.telemetry` column is `Json`, already schema-free. This is documented here for completeness; no task in the plan below builds a new plugin, since there's no concrete second sensor/hardware to integrate against yet (per `CLAUDE.md`'s "don't scaffold speculatively" stage note).

## Goals

1. **Service-due-by-mileage**: track maintenance history per vehicle (what was serviced, when, at what odometer reading) and auto-suggest a draft task (reusing the existing `TaskSuggested` → `services/board` draft-task flow) when a service interval is crossed.
2. **Fuel efficiency (km/L)**: compute a rolling mileage figure from telemetry deltas, honestly (skip the calculation entirely across a refuel, since consumption can't be inferred across a fuel-level increase) and surface it on the vehicle detail page.
3. **Idle-time detection**: raise an `AlertRaised` (info severity) when a vehicle's speed stays near zero for a sustained duration, reusing the existing alert → chat-system-message pipeline.

## Non-goals

- No new Ingestion Plugin (camera/dashcam) — no concrete hardware/use case to build against yet.
- No configurable-via-UI service intervals — a small fixed constant map (`oil_change: 10,000 km`, etc.) is enough for V1; a settings UI is a future follow-up if operators need custom intervals.
- No fuel-consumption estimate when `vehicleDetails.fuelCapacityLiters` is unset — the math needs a known tank size; skip silently rather than guess.
- No trip-level mileage history / charts — a single rolling "last computed mileage" figure, not a time series.

## Design

### D.1 Service-due-by-mileage

**`plugins/asset-vehicle`** gains a `MaintenanceRecord` entity (`assetId`, `serviceType`, `performedAt`, `odometerAtServiceKm`) and an HTTP API (`POST /maintenance-records`, `GET /maintenance-records/:assetId`), mirroring the existing `VehicleDetails` CRUD pattern exactly. `serviceType` is a small fixed enum (`oil_change`, `brake_inspection`, `tire_rotation`, `general_service`) — the vocabulary itself is vehicle-specific, so it belongs on the vehicle plugin, same reasoning as `VehicleDetails`.

**`services/fleet`** owns the "is this due" decision and the dedup bookkeeping (this is fleet's own idempotency concern, not vehicle domain data — belongs in `services/fleet`'s Prisma schema, not the plugin's):

- A fixed `SERVICE_INTERVALS_KM: Record<ServiceType, number>` constant.
- A new `MaintenanceSuggestion` table (`asset_id`, `service_type`, `suggested_at_odometer_km`) tracking the last odometer reading a suggestion was made at, per (asset, service type).
- On every `AssetHealthChanged` event (the existing subscription from sub-project A, Task 8), after updating `Asset.telemetry`: if the new `odometer_km` is present, fetch the vehicle's maintenance records (via `VehiclePluginClient`, extended with a `getMaintenanceRecords` method) and the last suggestion row, and apply this rule — **suggest once per crossing, re-nag only after another full interval passes unaddressed**:
  - `dueAt = (most recent MaintenanceRecord.odometerAtServiceKm for that serviceType, or 0) + interval`
  - If `odometer_km >= dueAt` AND (no prior suggestion, OR `odometer_km >= lastSuggestion.suggested_at_odometer_km + interval`): publish `TaskSuggested` (via the same `EventPublisher` `services/fleet` already needs for D.3's alerting — see below) and upsert the `MaintenanceSuggestion` row.
  - Logging an actual `MaintenanceRecord` (via a new "Log Maintenance" form on the vehicle detail page) naturally resets the baseline — the next due calculation uses the new record's odometer, no explicit "clear suggestion" step needed.

**Frontend**: the vehicle detail page (`app/fleet/vehicles/[id]/page.tsx`, from sub-project B/C) gets a new "Maintenance" card: a list of past `MaintenanceRecord`s (via a new `GET /api/fleet/assets/:id/maintenance-records` gateway-proxied route) and a small "Log Maintenance" form (service type select + odometer, defaulting to the vehicle's current odometer).

### D.2 Fuel efficiency (km/L)

Computed inside `services/fleet`'s existing `AssetHealthChanged` handler (`health-subscription.ts`), before the new telemetry overwrites the old:

1. Read the current `Asset` row (still holding the *previous* telemetry) before applying the update.
2. If both the old and new snapshots have numeric `fuel_pct` and `odometer_km`, and `vehicleDetails.fuelCapacityLiters` is known (one extra `VehiclePluginClient.getVehicleDetails` call, already implemented):
   - `distanceKm = new.odometer_km - old.odometer_km`
   - If `new.fuel_pct > old.fuel_pct` (a refuel happened): **skip the mileage calculation entirely for this delta** — consumption can't be inferred across a refuel — just proceed to the normal telemetry update.
   - Else: `fuelConsumedLiters = (old.fuel_pct - new.fuel_pct) / 100 * fuelCapacityLiters`. If `distanceKm > 0` and `fuelConsumedLiters > 0`: `mileageKmPerL = distanceKm / fuelConsumedLiters`, stored on a new nullable `Asset.last_mileage_kmpl` column.
3. Expose `last_mileage_kmpl` on the existing `GET /assets/:id` response (already returns the full `Asset` row) — no new endpoint needed, just a new field.

**Frontend**: vehicle detail page shows "Mileage: X.X km/L" when `last_mileage_kmpl` is non-null, "—" otherwise (never a fabricated number — same honesty rule as the digital twin's hotspots from sub-project C).

### D.3 Idle-time detection

Lives in `services/ai-engine` (Python) — the existing "intelligence layer" pattern, not `services/fleet`, since it needs `AssetLocationUpdated`'s `speed` field, which is `services/map`'s domain event, not `services/fleet`'s. `ai-engine` already only talks to the event bus (never direct service calls), so subscribing to a second event type here doesn't cross any architecture boundary.

- Add a Python mirror of `AssetLocationUpdated` and `AlertRaised` to `ai_engine/events.py` (this file already documents that it's a deliberate hand-kept mirror of the TS schemas, not a shared import — same pattern, two more models).
- New `ai_engine/idle_detection.py`: in-memory per-`asset_id` state (`last_moving_at: datetime`, `alerted_for_current_episode: bool`). On each `AssetLocationUpdated`:
  - If `speed > IDLE_SPEED_THRESHOLD_KMH` (3.0): update `last_moving_at = event.timestamp`, reset `alerted_for_current_episode = False` (a new idle episode can be detected next time it stops).
  - Else (at/near zero speed): if `(event.timestamp - last_moving_at) >= IDLE_DURATION_THRESHOLD_MIN` (20 minutes) and not already alerted for this episode: publish `AlertRaised(severity="info", reason="prolonged_idle", message="Vehicle idle for N min at (lat, lng)")`, set `alerted_for_current_episode = True` so it doesn't refire every subsequent tick.
- `server.py` gains a second `nc.subscribe(ASSET_LOCATION_UPDATED_SUBJECT, cb=...)` alongside the existing `AssetHealthChanged` subscription.

No frontend change needed for D.3 — `services/chat` already turns `AlertRaised` into a system message in the relevant mission channel; the idle alert just shows up there like any other alert.

## Testing

- `plugins/asset-vehicle`: repository + HTTP tests for `MaintenanceRecord` CRUD, mirroring the existing `VehicleDetails` test style.
- `services/fleet`: unit tests for the service-due rule (crosses threshold → suggests once; doesn't re-suggest until another full interval passes; a new `MaintenanceRecord` resets the baseline) and the mileage calculation (normal delta computes correctly; a refuel delta is skipped, not miscalculated; missing `fuelCapacityLiters` skips silently).
- `services/ai-engine`: unit tests for idle detection's state machine (crosses duration threshold → alerts once; moving again resets the episode; doesn't alert twice for the same continuous idle period), using the existing `InMemoryEventPublisher` pattern.
- `apps/web`: component tests for the new Maintenance card (list + log form) and the mileage display (present/absent states).
