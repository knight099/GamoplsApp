This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

GAMOPLS TeamCore — a Human-Machine Teaming Platform (MAP + CHAT + BOARD + HUB + CORE) that starts vehicle-first on GAMOPLS's Edge Box telemetry stream, and is designed to extend to maritime, drone, aviation, mining, and defence via a plugin architecture. Full design rationale lives in `docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md` — read that before making structural changes; this file only covers what's needed to work in the code day to day.

This is a monorepo: the web dashboard, the SaaS backend services, and (later) the mobile app and plugins all live here together.

## Monorepo layout

```
apps/
  web/                    # Next.js — the fleet manager dashboard (MAP/CHAT/BOARD/HUB UI)
  mobile/                 # React Native — driver app (added after web MVP)
services/
  core-ingestion/         # Go — Edge Box MQTT ingestion, normalizes raw telemetry into Asset events
  map/                    # NestJS — geospatial/live-tracking service
  chat/                   # NestJS — mission channels, messages, embedded media refs
  board/                  # NestJS — tasks/workflow, hosts AI Agent plugins
  hub/                    # NestJS — documents/knowledge base, RAG search
  ai-engine/              # Python — AI Health Engine, predictive maintenance, LangChain/LangGraph agents
packages/
  asset-contracts/        # Shared TS interfaces: Asset, Locatable, Monitorable, Alertable, Communicable, Taskable
  event-schemas/          # Shared event type defs: AssetLocationUpdated, AssetHealthChanged, AlertRaised, TaskSuggested, MessagePosted
  ui/                     # Shared React components used by apps/web (and later apps/mobile via RN-web where applicable)
  config/                 # Shared eslint/tsconfig/prettier base configs
plugins/
  asset-vehicle/          # V1 Asset Type Plugin — implements the Asset interfaces for vehicles
  ingestion-edgebox/       # V1 Ingestion Plugin — Edge Box protocol adapter
infra/                    # Terraform, docker-compose for local Postgres/TimescaleDB/Redis/NATS
docs/
  architecture/            # Architecture and design docs (source of truth for "why")
```

Package manager: pnpm with workspaces, task runner: Turborepo, for everything under `apps/`, `services/*` (Node ones), `packages/`, and `plugins/`. `services/core-ingestion` (Go) and `services/ai-engine` (Python) are not part of the pnpm workspace — they're invoked separately (see Commands).

## Commands

```bash
# Start the entire local platform (Docker NATS/MQTT, TS services, Go Ingestion, Python AI, and Simulator)
pnpm start:all

# Install & local infra
pnpm install
docker-compose -f infra/docker-compose.yml up -d   # Postgres/TimescaleDB, Redis, NATS, MQTT

# Run TS workspace services in dev mode (turbo runs all workspace `dev` scripts in parallel)
pnpm dev

# Run a single app/service
pnpm --filter web dev
pnpm --filter map dev
pnpm --filter board dev

# Build / lint / test across the whole workspace
pnpm build
pnpm lint
pnpm test

# Build / lint / test a single package or service
pnpm --filter web test
pnpm --filter @gamopls/asset-contracts build

# Run a single test file / pattern within a package
pnpm --filter map test -- src/geofence.spec.ts
pnpm --filter map test -- -t "raises alert on geofence exit"

# Go ingestion service
cd services/core-ingestion && go test ./...
cd services/core-ingestion && go test ./internal/normalize -run TestVehicleTelemetry

# Python AI engine
cd services/ai-engine && pytest
cd services/ai-engine && pytest tests/test_health_score.py -k "battery"
```

## Architecture rules that override intuition

These are the rules that make the plugin/SOLID design in `docs/architecture/` actually hold as the codebase grows. Violating them is the single most likely way this repo degrades back into a vehicle-only monolith — enforce them even under deadline pressure.

- **Never import a concrete Asset Type Plugin into a module service.** `services/map`, `services/chat`, `services/board`, `services/hub` must only depend on `packages/asset-contracts` (the `Asset`, `Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable` interfaces) and on events from `packages/event-schemas`. They must never `import` from `plugins/asset-vehicle` directly, and must never branch on asset type (`if (asset.type === 'vehicle')`). If a module needs type-specific behavior, that behavior belongs on the plugin (e.g., `asset.getMapIcon()`), not in the module.
- **Cross-module communication only via the event bus.** `map`, `chat`, `board`, and `hub` do not call each other's APIs directly for domain events — they publish/subscribe through NATS/Kafka using the event types in `packages/event-schemas`. Direct service-to-service calls are reserved for synchronous reads (e.g., dashboard fetching current asset list), not for propagating state changes.
- **Plugins are separate deployable services, not dynamically loaded code.** New Asset Type, Ingestion, Rule, or Agent plugins go in `plugins/<name>` and register themselves with CORE's plugin registry over the network — they are never `require()`'d or Go-plugin-loaded into a module service's process.
- **Multi-tenancy scoping is enforced at the API gateway, not per-query.** Every request is scoped by `org_id`/`fleet_id` via the JWT/ABAC claims before it reaches service logic — don't add ad-hoc `WHERE org_id = ...` scoping inside individual repository methods as the only line of defense.
- **A "Mission" is asset-type-agnostic.** Don't add vehicle-specific fields to the `Mission`/`Task` tables in `services/board`. Trip-specific data belongs on `VehicleDetails` (owned by `plugins/asset-vehicle`), referenced by `asset_id`.

## Current stage

V1 scope only: `apps/web`, `services/core-ingestion`, `services/map`, `services/board`, `services/chat`, `services/hub`, `plugins/asset-vehicle`, `plugins/ingestion-edgebox`. `apps/mobile` and non-vehicle plugins are not yet started — don't scaffold them speculatively until the web MVP is live for the Chennai pilots.
