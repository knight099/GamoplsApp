# edgebox-sim

Publishes fake Edge Box telemetry to a local MQTT broker, so
`services/core-ingestion` can be exercised end-to-end without real Edge Box
hardware.

## Why Go

`services/core-ingestion` is already Go, so this stays a zero-extra-runtime
dev tool — `go run .` needs nothing beyond the Go toolchain already required
to work on `core-ingestion`. It reuses the same raw payload field names
documented in `services/core-ingestion/internal/normalize` and
`plugins/ingestion-edgebox/src/edgebox-payload.ts`, without pulling in a
second language/package manager just for a dev script.

## Usage

Requires a local MQTT broker (e.g. `mosquitto`) reachable at the configured
broker URL. This repo's `infra/docker-compose.yml` does not currently
provision one — bring your own (`docker run -p 1883:1883 eclipse-mosquitto`
or `brew install mosquitto && mosquitto`) until an `infra/docker-compose.yml`
mosquitto service is added.

```bash
cd infra/simulators/edgebox-sim
go run . -devices 3 -org org-chennai-pilot -fleet fleet-north -interval 2s
```

Flags:

- `-broker` — MQTT broker URL (default `tcp://localhost:1883`, or `$MQTT_BROKER_URL`)
- `-org` — `org_id` stamped on every reading (default `org-chennai-pilot`)
- `-fleet` — `fleet_id` stamped on every reading (default `fleet-north`)
- `-devices` — number of simulated Edge Box devices (default `3`)
- `-interval` — publish interval per device (default `3s`)

Each simulated device publishes to
`edgebox/<org_id>/<fleet_id>/<device_id>/telemetry`, matching the topic
pattern `services/core-ingestion` subscribes to by default
(`MQTT_TOPIC_FILTER=edgebox/+/+/+/telemetry`). About 5% of messages are
intentionally malformed, to exercise `core-ingestion`'s drop-and-log path.
