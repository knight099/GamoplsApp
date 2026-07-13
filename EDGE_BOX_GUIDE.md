# GAMOPLS Edge Box — Device Integration Guide

How the physical Edge Box telemetry device connects to GAMOPLS TeamCore, what
code it needs to run, and how its data reaches the dashboard.

This is grounded in the actual code in this repo:
`services/core-ingestion` (Go), `infra/simulators/edgebox-sim` (Go reference
implementation), `infra/mosquitto/` (broker config), and
`packages/event-schemas`. There is no real firmware in this repo yet — the
simulator is a dev tool, not something you flash as-is, but it defines the
exact contract real firmware must speak.

## 1. What code runs on the Edge Box

The device needs an MQTT client that:

1. Connects to the MQTT broker (Mosquitto, see `infra/mosquitto/`) with credentials.
2. On an interval, reads GPS + vehicle sensors (OBD-II, or whatever telemetry hardware is wired in).
3. Publishes a JSON payload to a specific topic (below).

Any language with an MQTT client library works — the repo's own reference
implementation (`infra/simulators/edgebox-sim/main.go`) is Go using
`paho.mqtt.golang`, but this is not a requirement for real firmware.

## 2. Topic + payload contract

**Topic:**

```
edgebox/{org_id}/{fleet_id}/{device_id}/telemetry
```

Example: `edgebox/org-chennai-pilot/fleet-north/edgebox-001/telemetry`

`services/core-ingestion` subscribes with the wildcard filter
`edgebox/+/+/+/telemetry` (configurable via `MQTT_TOPIC_FILTER`).

**Payload** (parsed by `services/core-ingestion/internal/normalize/edgebox.go`):

```json
{
  "device_id": "edgebox-042",
  "asset_id": "vehicle-042",
  "org_id": "org-chennai-pilot",
  "fleet_id": "fleet-north",
  "ts": "2026-07-08T10:15:30.000Z",
  "gps": {
    "lat": 13.0827,
    "lng": 80.2707,
    "heading": 87.5,
    "speed_kmh": 42.1
  },
  "telemetry": {
    "battery_pct": 76,
    "engine_temp_c": 91.2,
    "fuel_pct": 54,
    "health_score": 88,
    "odometer_km": 12345
  }
}
```

Notes:

- `device_id`, `asset_id`, `org_id`, `fleet_id`, `ts` (RFC3339) are required.
- `gps` and `telemetry` are each optional, but at least one must be present.
- If `gps` is present, `lat`/`lng` are required and range-validated (-90..90 / -180..180).
- If `telemetry.health_score` is present, it's range-validated 0..100.
- Malformed messages are dropped and logged — never crash the subscriber.

### `asset_id` = the Pairing ID

`asset_id` is how the device claims to be a specific vehicle. It's literally
the vehicle asset's database ID. When you add a vehicle in the dashboard
(Fleet → Add vehicle), its detail page shows a **Pairing ID** — that value
*is* the `asset_id` you hardcode into the device's config/firmware, along
with the matching `org_id`/`fleet_id`.

## 3. Auth / ACL (current dev setup)

Mosquitto runs with `allow_anonymous false`, using a passwd file + ACL file
(`infra/mosquitto/acl`):

```
user edgebox
topic write edgebox/#

user core-ingestion
topic read edgebox/#
```

Dev credentials (`.env.example`): `MQTT_DEVICE_USERNAME=edgebox`,
`MQTT_DEVICE_PASSWORD=changeme-dev-only` — **shared across all simulated
devices**, write-only to `edgebox/#`. `core-ingestion` uses a separate
read-only `core-ingestion` user so a leaked device credential can't snoop
the fleet.

## 4. Building the physical hardware

Any small computer that can run an MQTT client + read sensors works — this
isn't prescribed by the repo. Common choices:

- **Raspberry Pi / Linux SBC** + USB GPS dongle + OBD-II Bluetooth/USB
  adapter — easiest to prototype, run a small Go/Python/Node script.
- **ESP32** + GPS module (e.g. NEO-6M) + OBD-II UART interface — cheaper,
  lower power, firmware in C/C++/MicroPython with an MQTT library (e.g.
  `PubSubClient`).

The firmware's job is small: read GPS + OBD, format the JSON payload above,
publish over MQTT (ideally MQTT/TLS) every N seconds.

## 5. Data flow to the dashboard

```
Edge Box  --MQTT-->  Mosquitto broker  --MQTT-->  services/core-ingestion (Go)
                                                          |
                                                   normalizes + publishes to NATS
                                                          |
                                    AssetLocationUpdated / AssetHealthChanged
                                                          |
                          -----------------------------------------------------
                          |                          |                        |
                    services/map              services/ai-engine        services/board
                (Redis position cache,      (rescores health,           (TaskSuggested →
                 geofence check,             may emit                    draft task)
                 AlertRaised)                TaskSuggested)
                          |
                    WebSocket → apps/web MapView (live position updates)
                    REST → apps/web fleet vehicle detail page (health, digital twin)
```

Event schemas (Zod, `packages/event-schemas/src/events/*.ts`):

- `assetLocationUpdatedSchema`: `type: "AssetLocationUpdated"`, `asset_id`,
  `lat`, `lng`, `heading?`, `speed?`, plus base event fields
  (`org_id`, `fleet_id`, `timestamp`).
- `assetHealthChangedSchema`: `type`, `asset_id`, `healthScore` (0..100),
  `telemetry: record` (opaque).

core-ingestion publishes raw health data on subject `AssetHealthRaw`;
`services/ai-engine` consumes that, rescores it, and republishes the final
`AssetHealthChanged`.

## 6. Known gap — not production-safe yet

The current security model is dev-only and has a real hole:

- **All simulated devices share one MQTT username/password.** Anyone with
  that one credential can publish telemetry claiming to be *any* `asset_id`.
- **Nothing server-side verifies that an incoming `asset_id` actually
  belongs to the org/fleet claiming it.** `core-ingestion` accepts any
  well-formed payload and forwards it — there's no binding check between
  the authenticated device identity and the `asset_id`/`org_id`/`fleet_id`
  in the payload.

The mosquitto config comments flag this as intentional-for-now: a real
deployment needs per-device MQTT credentials (or client TLS certificates)
provisioned at pairing time, and `core-ingestion` needs to validate that the
authenticated device identity matches the claimed asset/org/fleet. Neither
exists in code yet — build this before connecting real hardware to
anything beyond a private pilot network.
