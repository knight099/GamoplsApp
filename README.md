# GAMOPLS TeamCore

Human-Machine Teaming Platform — **MAP** · **CHAT** · **BOARD** · **HUB** · **CORE**

A multi-tenant fleet management platform that starts vehicle-first on GAMOPLS's Edge Box telemetry stream, and is designed to extend to maritime, drone, aviation, mining, and defence via a plugin architecture. No module service ever imports a concrete plugin or branches on asset type — extensibility is structural, not aspirational.

## Quick start

```bash
# Prerequisites: Node 22+, pnpm, Docker, Go 1.25+, Python 3.11+ / uv

# Install JS/TS dependencies
pnpm install

# Start local infrastructure (Postgres/TimescaleDB, Redis, NATS)
docker-compose -f infra/docker-compose.yml up -d

# Build everything
pnpm build

# Run all tests
pnpm test

# Start all services + web app in dev mode
pnpm dev
```

## Architecture

```
apps/web (Next.js)           ← Dashboard: MAP / CHAT / BOARD / HUB views
  └─ Gateway (BFF)           ← JWT verify + org/fleet scope injection
      │
      ├─ services/map        ← Geospatial: live positions, geofences
      ├─ services/chat       ← Mission channels, messages
      ├─ services/board      ← Tasks/workflow, AI agent plugins
      ├─ services/hub        ← Documents, keyword search (RAG stub)
      └─ services/registry   ← Plugin self-registration
                │
            NATS (event bus)
                │
      ├─ services/ai-engine  ← Health scoring, predictive maintenance (Python)
      └─ services/core-ingestion  ← MQTT→NATS bridge (Go)
                │
          Edge Boxes (hardware)
```

Full design rationale: [`docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md`](docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md)  
Day-to-day working rules: [`CLAUDE.md`](CLAUDE.md)  
V1 build plan: [`PLAN.md`](PLAN.md)

## Repository layout

| Directory | Purpose | Language |
|---|---|---|
| `apps/web` | Next.js dashboard (MAP/CHAT/BOARD/HUB UI + BFF gateway) | TypeScript |
| `services/map` | Geospatial service (live tracking, geofences) | TypeScript / Fastify |
| `services/chat` | Messaging service (mission channels) | TypeScript / Fastify |
| `services/board` | Task/workflow service (missions, tasks, AI agents) | TypeScript / Fastify |
| `services/hub` | Document/knowledge base service | TypeScript / Fastify |
| `services/registry` | Plugin registry | TypeScript / Fastify |
| `services/core-ingestion` | MQTT→NATS telemetry bridge | Go |
| `services/ai-engine` | Health scoring + LangGraph agent skeleton | Python |
| `packages/asset-contracts` | `Asset` + role interfaces (`Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable`) | TypeScript |
| `packages/event-schemas` | Event types + Zod validators + `EventPublisher`/`EventSubscriber` ports | TypeScript |
| `packages/event-bus-nats` | NATS adapter (sole concrete event bus implementation) | TypeScript |
| `packages/auth` | JWT issuance/verification, session cookies | TypeScript |
| `packages/ui` | Shared React components | TypeScript |
| `packages/config` | Shared tsconfig, ESLint, Prettier configs | — |
| `plugins/asset-vehicle` | V1 Asset Type Plugin (vehicle) | TypeScript |
| `plugins/ingestion-edgebox` | V1 Ingestion Plugin (Edge Box protocol adapter) | TypeScript |
| `infra/` | Docker Compose (Postgres, Redis, NATS) + simulators | YAML |

## Commands

```bash
# Full workspace
pnpm build                  # Build all packages/services
pnpm lint                   # Lint all packages/services
pnpm test                   # Test all packages/services
pnpm dev                    # Dev mode (all services + web)
pnpm check:architecture     # CI architecture guard

# Single package/service
pnpm --filter map dev
pnpm --filter @gamopls/asset-contracts build
pnpm --filter board test -- src/task-suggested-handler.spec.ts

# Go ingestion service
cd services/core-ingestion && go test ./...

# Python AI engine
cd services/ai-engine && pytest
```

## Environment

Copy `.env.example` to `.env` and adjust values. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://gamopls:changeme@localhost:5432/gamopls_teamcore` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `NATS_URL` | `nats://localhost:4222` | NATS connection |
| `JWT_SECRET` | `changeme-dev-only-...` | JWT signing secret |
| `MAP_SERVICE_URL` | `http://localhost:4401` | Map service base URL (gateway) |
| `CHAT_SERVICE_URL` | `http://localhost:4300` | Chat service base URL (gateway) |
| `BOARD_SERVICE_URL` | `http://localhost:4302` | Board service base URL (gateway) |
| `HUB_SERVICE_URL` | `http://localhost:4500` | Hub service base URL (gateway) |

## Architecture rules

These are enforced by CI (`scripts/check-architecture-rules.mjs`):

- **Never import a concrete plugin into a module service.** `services/*` depend on `packages/asset-contracts` and `packages/event-schemas`, never on `plugins/*`.
- **Never branch on asset type.** No `if (asset.type === 'vehicle')` in services. Use `asset.getMapIcon()`, `asset.getDisplayLabel()`, etc.
- **Cross-module communication via event bus only.** Domain state changes flow through NATS, not direct HTTP calls.
- **Multi-tenancy enforced at the gateway.** The BFF gateway overwrites `org_id`/`fleet_id` from the verified JWT before forwarding to services.

## V1 scope

Chennai pilots — vehicles only. `apps/mobile` and non-vehicle plugins are explicitly out of scope until the web MVP is live.

## License

Proprietary. © GAMOPLS.
