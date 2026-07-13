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
  map/                    # Fastify — geospatial/live-tracking routes + domain logic (owns its tests)
  chat/                   # Fastify — mission channels, messages, embedded media refs (owns its tests)
  board/                  # Fastify — tasks/workflow, hosts AI Agent plugins (owns its tests)
  hub/                    # Fastify — documents/knowledge base, RAG search (owns its tests)
  fleet/                  # Fastify — fleet/driver/asset registry, driver-assignment history (owns its tests)
  registry/               # Fastify — CORE plugin registry: where Asset Type/Ingestion/Rule/Agent
                          # plugins self-register over HTTP (owns its tests)
  backend/                # THE V1 deployable: mounts map/chat/board/hub/fleet/registry as route
                          # modules (/map, /chat, /board, /hub, /fleet, /registry) on one Fastify
                          # process. See "Deployment topology (V1)" below — the modules still only
                          # talk to each other over the event bus, never via direct calls.
  ai-engine/              # Python — AI Health Engine, predictive maintenance, LangChain/LangGraph agents
packages/
  asset-contracts/        # Shared TS interfaces: Asset, Locatable, Monitorable, Alertable, Communicable, Taskable
  event-schemas/          # Shared event type defs: AssetLocationUpdated, AssetHealthChanged, AlertRaised, TaskSuggested, MessagePosted
  ui/                     # Shared React components used by apps/web (and later apps/mobile via RN-web where applicable)
  config/                 # Shared eslint/tsconfig/prettier base configs
plugins/
  asset-vehicle/          # V1 Asset Type Plugin — implements the Asset interfaces for vehicles
  ingestion-edgebox/       # V1 Ingestion Plugin — Edge Box protocol adapter
infra/                    # Terraform, docker-compose for local NATS/MQTT (Postgres is Neon, Redis is Upstash — no local containers)
docs/
  architecture/            # Architecture and design docs (source of truth for "why")
```

Package manager: pnpm with workspaces, task runner: Turborepo, for everything under `apps/`, `services/*` (Node ones), `packages/`, and `plugins/`. `services/core-ingestion` (Go) and `services/ai-engine` (Python) are not part of the pnpm workspace — they're invoked separately (see Commands).

## Commands

```bash
# Start the entire local platform (Docker NATS/MQTT, TS services, Go Ingestion, Python AI, and Simulator)
pnpm start:all

# Lighter local dev: docker infra + web + services/backend (map/chat/board/hub
# mounted as route modules on ONE process/port instead of 4 separate `tsx watch`
# processes), skipping Go ingestion/Python AI/simulator. Recommended default for
# day-to-day work — see services/backend/src/server.ts.
pnpm start:light

# Docker infra + web only, no backend
pnpm start:web

# Install & local infra
pnpm install
docker-compose -f infra/docker-compose.yml up -d   # NATS, MQTT — that's it. No local Postgres/Redis
                                                    # containers; DATABASE_URL (Neon) and
                                                    # UPSTASH_REDIS_REST_URL/TOKEN are required, not
                                                    # optional fallbacks. See .env.example.

# Run web + backend + the vehicle plugin in dev mode (this is what `pnpm dev`
# is scoped to — plugins/asset-vehicle has to run as its own process even in
# the V1 single-backend topology, since it's the one thing that's genuinely
# a separate deployable; see "Deployment topology (V1)" below). Use
# `turbo run dev` unscoped, or --filter, to also run an individual
# map/chat/board/hub service standalone for isolated debugging.
pnpm dev

# Build + run web + backend + the vehicle plugin against built output
# (production-shaped)
pnpm build
pnpm start

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

- **Never import a concrete Asset Type Plugin into a module service.** `services/map`, `services/chat`, `services/board`, `services/hub`, `services/fleet` must only depend on `packages/asset-contracts` (the `Asset`, `Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable` interfaces) and on events from `packages/event-schemas`. They must never `import` from `plugins/asset-vehicle` directly, and must never branch on asset type (`if (asset.type === 'vehicle')`). If a module needs type-specific behavior, that behavior belongs on the plugin (e.g., `asset.getMapIcon()`), not in the module. `services/fleet` is the one exception allowed to *call* the plugin, and only over HTTP via `VehiclePluginClient` — never by importing it.
- **Cross-module communication only via the event bus.** `map`, `chat`, `board`, `hub`, and `fleet` do not call each other's APIs directly for domain events — they publish/subscribe through NATS/Kafka using the event types in `packages/event-schemas`. Direct service-to-service calls are reserved for synchronous reads (e.g., dashboard fetching current asset list), not for propagating state changes.
- **Plugins are separate deployable services, not dynamically loaded code.** New Asset Type, Ingestion, Rule, or Agent plugins go in `plugins/<name>` and register themselves with CORE's plugin registry over the network — they are never `require()`'d or Go-plugin-loaded into a module service's process.
- **Multi-tenancy scoping is enforced at the API gateway, not per-query.** Every request is scoped by `org_id`/`fleet_id` via the JWT/ABAC claims before it reaches service logic — don't add ad-hoc `WHERE org_id = ...` scoping inside individual repository methods as the only line of defense.
- **A "Mission" is asset-type-agnostic.** Don't add vehicle-specific fields to the `Mission`/`Task` tables in `services/board`. Trip-specific data belongs on `VehicleDetails` (owned by `plugins/asset-vehicle`), referenced by `asset_id`.

## Deployment topology (V1)

`services/map`, `services/chat`, `services/board`, `services/hub`, `services/fleet`, `services/registry` are deployed as **one process** — `services/backend` — instead of six. This is a V1 ops simplification (fewer processes to run/host for the Chennai pilot, and to fit cheaply on a single small VM/container), not a reversal of the module boundaries above:

- Each module still owns its own routes, schemas, and tests (`buildApp()` / `registerXRoutes()` in its `build-app.ts`). `services/backend` only imports `registerXRoutes` from each and mounts it under a path prefix (`/map`, `/chat`, `/board`, `/hub`, `/fleet`, `/registry`) — it contains no domain logic of its own.
- The **event-bus-only rule still applies in full**: these modules still never call each other directly (no importing one module's service class from another) — only via NATS, exactly as if they were separate processes. Sharing a process doesn't grant an exception; `pnpm check:architecture` doesn't check for this specific case, so it's on code review to catch a direct cross-module call if one shows up.
- The **plugin rule is unaffected and is the intended extension point going forward**: `plugins/asset-vehicle`, `plugins/ingestion-edgebox` (and any future asset-type/ingestion/rule/agent plugin — maritime, drone, aviation, mining, defence) stay separate deployables that register with CORE (`/registry`, mounted inside `services/backend`) over HTTP. They are never imported into `services/backend` or any of its route modules. **New product features should default to a new plugin, not a new route module inside `services/backend`** — that's what keeps the single-backend simplification from regressing into a growing monolith.
- `services/core-ingestion` (Go) and `services/ai-engine` (Python) stay separate processes — different language runtimes can't share `services/backend`'s Node process.
- If/when a module needs to scale or deploy independently (e.g. `map`'s WebSocket fan-out under load), split it back out of `services/backend` into its own process — the code doesn't need to change, since routes are already factored as `registerXRoutes(app, deps)`, callable from either a shared or a standalone Fastify instance. Each service also still has its own `server.ts` for exactly this (currently unused in the default scripts, kept for that path).

## Current stage

V1 scope only: `apps/web`, `services/core-ingestion`, `services/backend` (mounting `services/map`, `services/board`, `services/chat`, `services/hub`, `services/fleet`, `services/registry`), `plugins/asset-vehicle`, `plugins/ingestion-edgebox`. `apps/mobile` and non-vehicle plugins are not yet started — don't scaffold them speculatively until the web MVP is live for the Chennai pilots.
