# GAMOPLS TeamCore — Platform Architecture

> **Status:** V1 (Chennai pilot scope).  
> **Last updated:** July 2026.  
> **Audience:** Anyone extending this codebase — new engineers, AI coding agents, future-you.

This document is the source of truth for **why** the system is shaped the way it is. For day-to-day working rules (what to import, what not to branch on, which commands to run), see [`CLAUDE.md`](../../CLAUDE.md). For the build sequence that produced this codebase, see [`PLAN.md`](../../PLAN.md).

---

## 1. Problem statement

GAMOPLS operates mixed fleets — vehicles today, drones/vessels/mining equipment/defence assets later — across multi-tenant organisations. Each fleet type has radically different telemetry protocols, health indicators, and operational workflows, but the fleet manager's daily work (tracking assets on a map, communicating with crews, managing tasks, searching documents) is structurally identical across all of them.

The core risk is that a platform built vehicle-first quietly hardens into a vehicle-only monolith. Every `if (asset.type === 'vehicle')` branch in a shared service is a mine that explodes when the second asset type ships. The architecture below exists to make that failure mode structurally impossible, not just a code-review reminder.

---

## 2. Design principles (SOLID, applied)

Each SOLID principle maps to a concrete, enforced rule:

| Principle | Rule | Enforcement |
|---|---|---|
| **Single Responsibility** | Each service owns exactly one domain concern. | Code review + service boundary (separate process, separate DB schema). |
| **Open/Closed** | New asset behaviour ships as a new plugin. Module services are never modified. | CI architecture guard (`scripts/check-architecture-rules.mjs`) fails the build if any `services/*` package.json lists a `plugins/*` dependency. |
| **Liskov Substitution** | Any `Asset` implementation is usable anywhere the `Asset` interface is expected. | `renderMarker()` in `services/map` is typed `Asset & Locatable` — it physically cannot inspect the concrete type. Tested with synthetic non-vehicle fixtures. |
| **Interface Segregation** | `Asset` is split into narrow role interfaces (`Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable`). | Each interface is its own importable module in `packages/asset-contracts`. A plugin only implements the capabilities its asset actually has. |
| **Dependency Inversion** | Module services depend on abstractions (`packages/asset-contracts`, `packages/event-schemas`), never on concretions (`plugins/*`). | Three-layer CI check: dependency audit, source-level import scan, heuristic asset-type-branching grep (warn). |

---

## 3. System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                          │
│  ┌──────┐  ┌──────┐  ┌───────┐  ┌─────┐                           │
│  │ MAP  │  │ CHAT │  │ BOARD │  │ HUB │   ← Server Components     │
│  └──┬───┘  └──┬───┘  └───┬───┘  └──┬──┘                           │
│     │         │          │         │                               │
│  ┌──▼─────────▼──────────▼─────────▼──┐                            │
│  │     Gateway (BFF route handlers)    │  ← JWT verify + tenant    │
│  │     lib/gateway-proxy.ts            │    scope injection        │
│  └──┬─────────┬──────────┬─────────┬──┘                            │
└─────┼─────────┼──────────┼─────────┼───────────────────────────────┘
      │ HTTP    │ HTTP     │ HTTP    │ HTTP
┌─────▼───┐ ┌──▼────┐ ┌───▼───┐ ┌──▼────┐    ┌──────────────┐
│  map    │ │ chat  │ │ board │ │  hub  │    │   registry   │
│ :4401   │ │ :4300 │ │ :4302 │ │ :4500 │    │   :4600      │
│Fastify  │ │Fastify│ │Fastify│ │Fastify│    │  Fastify     │
└────┬────┘ └───┬───┘ └───┬───┘ └───────┘    └──────────────┘
     │          │         │                         ▲
     │    ┌─────▼─────────▼───┐                     │ HTTP self-register
     │    │      NATS          │◄────────────────┐   │
     │    │ (event bus)        │                 │   │
     │    └────────▲───────────┘                 │   │
     │             │                             │   │
     │      ┌──────┴──────┐              ┌───────┴───┴───────────┐
     │      │  ai-engine  │              │  plugins/             │
     │      │  (Python)   │              │  ├─ asset-vehicle     │
     │      └─────────────┘              │  └─ ingestion-edgebox │
     │                                   └───────────────────────┘
     │
┌────▼──────────────────────┐
│    core-ingestion (Go)    │
│    MQTT → NATS bridge     │
└───────────▲───────────────┘
            │ MQTT
    ┌───────┴───────┐
    │  Edge Boxes   │
    │  (hardware)   │
    └───────────────┘
```

---

## 4. Package and service catalogue

### 4.1 Shared packages (`packages/*`)

All TypeScript. Part of the pnpm workspace. These are the load-bearing abstractions that enforce the plugin architecture.

| Package | Purpose | Key exports |
|---|---|---|
| `@gamopls/asset-contracts` | Base `Asset` type + role interfaces | `Asset`, `Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable` |
| `@gamopls/event-schemas` | Event payload types + Zod validators + transport-agnostic ports | `AssetLocationUpdated`, `AssetHealthChanged`, `AlertRaised`, `TaskSuggested`, `MessagePosted`, `EventPublisher`, `EventSubscriber` |
| `@gamopls/event-bus-nats` | The **only** concrete event bus adapter. Implements `EventPublisher`/`EventSubscriber` against NATS. | `NatsEventBus` |
| `@gamopls/auth` | JWT issuance/verification, session cookie helpers. Self-issued JWTs carrying `org_id`, `fleet_id`, `role` claims. | `issueJwt`, `verifyJwt`, `GamoplsJwtClaims`, `SESSION_COOKIE_NAME` |
| `@gamopls/ui` | Shared React components used by `apps/web`. | `Card`, layout primitives |
| `@gamopls/config` | Shared `tsconfig.base.json`, ESLint config, Prettier config. | Config files (no runtime exports) |

### 4.2 Module services (`services/*`)

Each service owns one domain concern, runs as a separate process, has its own database schema (where applicable), and communicates with other services **only** via NATS events for state changes. Direct HTTP calls are reserved for synchronous reads from the web dashboard.

| Service | Language | Framework | Domain | Port |
|---|---|---|---|---|
| `map` | TypeScript | Fastify | Geospatial: live positions, geofence CRUD, geofence-exit detection → `AlertRaised` | 4401 |
| `chat` | TypeScript | Fastify | Messaging: mission channel CRUD, message CRUD, auto-posts system messages on `AlertRaised` | 4300 |
| `board` | TypeScript | Fastify | Workflow: Mission/Task CRUD (asset-type-agnostic), task assignment to any `Taskable`, AI Agent plugin registration, `TaskSuggested` → draft task | 4302 |
| `hub` | TypeScript | Fastify | Documents: upload/storage, metadata, keyword search (RAG stub interface for V2) | 4500 |
| `registry` | TypeScript | Fastify | Plugin registry: self-registration endpoint, read API for known asset types/capabilities | 4600 |
| `core-ingestion` | Go | stdlib + MQTT/NATS clients | Telemetry bridge: MQTT subscriber → Edge Box payload normalisation → publishes `AssetLocationUpdated`/`AssetHealthChanged` to NATS | — |
| `ai-engine` | Python | Pydantic + (optional) LangGraph | Health scoring: recomputes health score from telemetry, publishes `TaskSuggested` on threshold breach. LangGraph agent skeleton for future predictive maintenance. | — |

### 4.3 Plugins (`plugins/*`)

Plugins are **separate deployable units** that register themselves with `services/registry` over HTTP. They are never `require()`'d or dynamically loaded into a module service's process.

| Plugin | Purpose |
|---|---|
| `asset-vehicle` | V1 Asset Type Plugin. Implements `Asset`, `Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable` for vehicles. Owns `VehicleDetails` (trip data, plate number, fuel type). |
| `ingestion-edgebox` | V1 Ingestion Plugin. Edge Box MQTT payload parser → normalised `AssetLocationUpdated`/`AssetHealthChanged` DTOs. Protocol-specific parsing lives here, nowhere else. |

### 4.4 Infrastructure (`infra/`)

| Component | Image | Purpose |
|---|---|---|
| Postgres + TimescaleDB | `timescale/timescaledb:latest-pg16` | Primary datastore for all services that need persistence. TimescaleDB extension available for time-series telemetry queries. |
| Redis | `redis:7-alpine` | Live position cache for `services/map`. |
| NATS | `nats:2-alpine` with JetStream | Event bus transport. JetStream enabled for at-least-once delivery. |

All three are defined in `infra/docker-compose.yml` with named volumes and health checks.

---

## 5. Data flow: telemetry to dashboard

This is the canonical happy path — a GPS position update from an Edge Box appearing on a fleet manager's MAP view:

```
1. Edge Box publishes raw MQTT telemetry to broker
2. services/core-ingestion subscribes to MQTT
3. core-ingestion calls plugins/ingestion-edgebox's normaliser (over network/adapter protocol)
4. Normalised AssetLocationUpdated event published to NATS subject "asset.location.updated"
5. services/map subscribes to "asset.location.updated"
6. map updates the Redis position cache, runs geofence exit detection
7. If geofence exit: map publishes AlertRaised to NATS
   └→ services/chat subscribes, auto-posts a system message to the mission channel
8. map broadcasts updated fleet markers to connected WebSocket clients
9. apps/web's MapView component receives the update (or polls REST)
10. Marker rendered using asset.getMapIcon() / asset.getDisplayLabel() — no type branching
```

Health scoring follows a parallel path:

```
1–3. Same as above, but producing AssetHealthChanged
4.   Published to NATS subject "asset.health.changed"
5.   services/ai-engine subscribes, recomputes health score from telemetry
6.   If score crosses threshold → publishes TaskSuggested to NATS
7.   services/board subscribes, creates a draft Task
```

---

## 6. Multi-tenancy

Every request is scoped by `org_id` and `fleet_id`. Enforcement happens **once, at the gateway** — not sprinkled per-query inside services.

### How it works

1. **Login** → `apps/web/lib/demo-login.ts` (V1 placeholder) issues a JWT via `@gamopls/auth.issueJwt()` with `org_id`, `fleet_id`, `role` claims baked in.
2. **Gateway** → `apps/web/lib/gateway-proxy.ts` (`createGatewayHandler`) intercepts every `/api/{map,chat,board,hub}/...` request:
   - Reads the JWT from the `httpOnly` session cookie.
   - Verifies and decodes it via `@gamopls/auth.verifyJwt()`.
   - **Overwrites** `org_id`/`fleet_id` query params on the forwarded request with the values from the verified token, discarding any client-supplied values.
3. **Services** → receive `org_id`/`fleet_id` as query params and treat them as authoritative. They do not re-verify the JWT. This is intentional: the trust boundary is at the gateway, and services are not publicly reachable.

### Security fix (discovered during V1 build)

`services/hub`'s document upload initially trusted `org_id`/`fleet_id` from the **request body** instead of the gateway-forced query params — a cross-tenant write vulnerability. Fixed in `services/hub/src/schemas.ts` and `services/hub/src/build-app.ts`. A regression test (`services/hub/src/__tests__/`) proves a spoofed body `org_id` is ignored.

---

## 7. Plugin architecture

### 7.1 Why plugins are separate processes

The CLAUDE.md rule — "Plugins are separate deployable services, not dynamically loaded code" — exists because:

- **LSP/OCP hold at the process boundary.** If a module service can't `require()` a plugin, it physically cannot branch on the plugin's internals. The interface contract (`Asset`, role interfaces, event schemas) is the only coupling.
- **Independent deploy cadence.** Shipping a new drone plugin doesn't require redeploying `services/map`.
- **Fault isolation.** A crashing vehicle plugin doesn't take down the task board.

### 7.2 Registration flow

```
Plugin boots → POST /plugins/register to services/registry
  Body: { type: "vehicle", capabilities: ["locatable", "monitorable", ...], url: "..." }
  ← 201 { id, type, capabilities, registeredAt }

Module service needs to know what asset types exist → GET /plugins from services/registry
  ← { plugins: [...] }
```

### 7.3 How module services consume assets without importing plugins

Module services never hold a concrete `Vehicle` instance. Instead:

1. **Events** carry all needed data as plain JSON conforming to `@gamopls/event-schemas` types (Zod-validated at publish time). A `services/map` handler receives an `AssetLocationUpdated` event with `{ asset_id, org_id, fleet_id, lat, lng, heading, speed, timestamp }` — no plugin import needed.
2. **Rendering metadata** (icon, label) is set out-of-band via `PUT /assets/:assetId/metadata` on `services/map`. In production this will be called by the plugin or the registry on asset registration. The metadata is stored alongside the cached position.
3. **`AssetMarker`** wraps this data into an object satisfying `Asset & Locatable` from `@gamopls/asset-contracts`. `renderMarker()` calls `asset.getMapIcon()` / `asset.getDisplayLabel()` — dispatched to the stored values, with no type-check in sight.

---

## 8. Event bus

### 8.1 Architecture

```
                      packages/event-schemas
                      ├── Event types (TS + Zod)
                      └── Ports: EventPublisher, EventSubscriber  ← abstractions
                                    ▲
                                    │ implements
                      packages/event-bus-nats
                      └── NatsEventBus  ← sole concrete adapter
```

**Only `packages/event-bus-nats`** is allowed to `import nats`. Module services import `EventPublisher`/`EventSubscriber` from `@gamopls/event-schemas` and receive a `NatsEventBus` instance at their composition root (`server.ts`). If the transport changes to Kafka/Redis Streams/etc., only `event-bus-nats` (or a new `event-bus-kafka` package) changes — services are untouched.

### 8.2 Event catalogue

| Subject | Schema | Producer(s) | Consumer(s) |
|---|---|---|---|
| `asset.location.updated` | `AssetLocationUpdated` | `core-ingestion` | `map` |
| `asset.health.changed` | `AssetHealthChanged` | `core-ingestion`, `ai-engine` | `ai-engine`, (future: `board` dashboard widgets) |
| `alert.raised` | `AlertRaised` | `map` (geofence exit) | `chat` (auto-post system message) |
| `task.suggested` | `TaskSuggested` | `ai-engine` | `board` (create draft task) |
| `message.posted` | `MessagePosted` | `chat` | (future: notification service) |

### 8.3 Validation boundary

Events are Zod-validated at the **publish** boundary — the producer validates before `EventPublisher.publish()`. This means a malformed event fails loudly at the source, not silently deep in a consumer. Consumers may defensively re-validate, but the schema contract is owned by the producer.

---

## 9. AI engine

`services/ai-engine` is a Python service (Pydantic, optional LangGraph) that:

1. **Subscribes** to `AssetHealthChanged` events from NATS.
2. **Recomputes** the health score from raw telemetry using `health_score.py` — a scorer function that inspects well-known telemetry field names (`battery_pct`, `fuel_pct`, `engine_temp_c`, `tire_pressure_psi`). **It never branches on asset type.** Unknown fields are skipped, so drones/vessels that populate different telemetry fields work without modifying this code.
3. **Publishes** an updated `AssetHealthChanged` with the computed score (not a passthrough of the input).
4. **If the score crosses a threshold**, publishes `TaskSuggested` → consumed by `services/board` to create a draft task.

The LangGraph agent skeleton (`agent_skeleton.py`) is a single-node stub for future predictive maintenance workflows. It's intentionally minimal — the architecture supports growing it without changing the event flow.

---

## 10. CI and automated architecture enforcement

### 10.1 Architecture guard (`scripts/check-architecture-rules.mjs`)

Three checks, run on every PR:

1. **Dependency check (hard fail):** Scans every `services/*/package.json` for `plugins/*` dependencies. Discovers plugin package names dynamically from `plugins/*/package.json` so it generalises to future plugins.
2. **Source-level import check (hard fail):** Scans `services/*/src/**/*.{ts,tsx}` for `import`/`require` statements referencing `plugins/` paths or plugin package names.
3. **Asset-type branching check (warn):** Heuristic grep for `asset.type === 'vehicle'`-style patterns. Warns rather than fails (false positives are plausible in tests/comments), but signals code review attention.

### 10.2 CI pipeline (`.github/workflows/ci.yml`)

```
checkout → setup Node/pnpm → install → check:architecture → lint → build → test
```

Runs on every PR and push to `main`. The architecture guard runs **before** lint/build/test so a structural violation is caught as early as possible.

### 10.3 What's not yet automated (Phase 7 remaining)

- **End-to-end integration test** (7.1): simulator → ingestion → NATS → services → web. Requires live Postgres/Redis/NATS/MQTT.
- **Load test** (7.3): ingestion path against expected Chennai pilot fleet size.
- Both require infrastructure that isn't available in the development sandbox and are intended for a staging environment.

---

## 11. Technology choices

| Decision | Choice | Rationale |
|---|---|---|
| **Monorepo** | pnpm workspaces + Turborepo | Shared packages (`asset-contracts`, `event-schemas`) are used by 6+ consumers. A monorepo keeps them in lockstep without publishing to a registry. |
| **Backend framework (Node services)** | Fastify | Lightweight, schema-first, excellent test ergonomics (`app.inject()`). All five Node services use the same `buildApp()` → `server.ts` split. |
| **Web framework** | Next.js (App Router) | Server Components for session-aware layouts, Route Handlers as the BFF gateway layer, no separate gateway service needed for V1. |
| **Ingestion service** | Go | MQTT + NATS bridging is I/O-bound and benefits from Go's concurrency model. Keeps the hot path out of the Node event loop. |
| **AI engine** | Python (Pydantic, optional LangGraph) | ML/AI ecosystem is Python-native. Pydantic for event validation keeps the interface clean. LangGraph is an optional dependency — the health scorer works without it. |
| **Event bus** | NATS with JetStream | Lighter ops than Kafka for a pilot. JetStream gives at-least-once delivery. Transport is abstracted behind `EventPublisher`/`EventSubscriber` ports, swappable without touching services. |
| **Database** | Postgres + TimescaleDB | Relational for Mission/Task/Channel/Document models. TimescaleDB available for time-series telemetry queries when needed. |
| **Cache** | Redis | Live position cache for `services/map`. Sub-millisecond reads for the WebSocket broadcast path. |
| **Auth** | Self-issued JWT (`@gamopls/auth`) | Simplest approach for V1. Swappable for Auth0/Clerk by replacing `issueJwt`/`verifyJwt` implementations in `packages/auth`. |

---

## 12. Repository structure

```
GamoplsApp/
├── apps/
│   └── web/                        # Next.js dashboard
│       ├── app/                    # App Router pages + API route handlers (gateway)
│       ├── components/             # React components (MapView, ChatView, etc.)
│       └── lib/                    # gateway-proxy.ts, session.ts, demo-login.ts
├── services/
│   ├── map/                        # Geospatial (Fastify, TypeScript)
│   ├── chat/                       # Messaging (Fastify, TypeScript)
│   ├── board/                      # Tasks/workflow (Fastify, TypeScript)
│   ├── hub/                        # Documents (Fastify, TypeScript)
│   ├── registry/                   # Plugin registry (Fastify, TypeScript)
│   ├── core-ingestion/             # MQTT→NATS bridge (Go)
│   └── ai-engine/                  # Health scoring + agent (Python)
├── packages/
│   ├── asset-contracts/            # Asset + role interfaces
│   ├── event-schemas/              # Event types + Zod + ports
│   ├── event-bus-nats/             # NATS adapter (sole transport impl)
│   ├── auth/                       # JWT issuance/verification
│   ├── ui/                         # Shared React components
│   └── config/                     # Shared tsconfig/eslint/prettier
├── plugins/
│   ├── asset-vehicle/              # Vehicle Asset Type Plugin
│   └── ingestion-edgebox/          # Edge Box Ingestion Plugin
├── infra/
│   ├── docker-compose.yml          # Postgres, Redis, NATS
│   └── simulators/edgebox-sim/     # Fake Edge Box MQTT telemetry
├── scripts/
│   ├── check-architecture-rules.mjs    # CI architecture guard
│   └── __tests__/                      # Tests for the guard itself
├── .github/workflows/ci.yml       # PR/push CI pipeline
├── CLAUDE.md                       # Day-to-day working rules
├── PLAN.md                         # V1 build plan
└── docs/architecture/
    └── GAMOPLS_TeamCore_Platform_Architecture.md   # ← you are here
```

---

## 13. Extending the platform

### Adding a new asset type (e.g., drone)

1. Create `plugins/asset-drone/`.
2. Implement `Asset`, `Locatable`, and whichever role interfaces the drone supports.
3. Register with `services/registry` on boot.
4. Create `plugins/ingestion-drone-controller/` to parse the drone's telemetry protocol → normalised events.
5. No changes to `services/map`, `services/chat`, `services/board`, or `services/hub`. They already work with any `Asset`.

### Adding a new module service

1. Create `services/<name>/` following the `buildApp()` + `server.ts` convention.
2. Depend only on `@gamopls/asset-contracts`, `@gamopls/event-schemas`, and (at the composition root) `@gamopls/event-bus-nats`.
3. Never import from `plugins/*`. The CI guard will catch you if you try.

### Swapping the event bus transport

1. Create `packages/event-bus-kafka/` implementing `EventPublisher`/`EventSubscriber` from `@gamopls/event-schemas`.
2. Change the composition root (`server.ts`) of each service to instantiate the new adapter instead of `NatsEventBus`.
3. No other code changes. The port interfaces are the stability boundary.

---

## 14. Known limitations (V1)

- **No real identity provider.** Auth is a demo login with hardcoded credentials. Replace `packages/auth` internals with Auth0/Clerk before production.
- **In-memory repositories in tests.** `chat`, `board`, `hub` use in-memory stores by default. Postgres-backed repositories exist for `board` but the others need them for production.
- **No interactive map.** The MAP view renders a data table, not a Leaflet/Mapbox map — requires a tile provider API key, deferred to post-MVP.
- **No RAG search.** `hub`'s search is keyword-based. The `SearchProvider` interface is ready for an embedding-backed implementation.
- **No end-to-end integration test.** Needs live Postgres/Redis/NATS/MQTT.
- **WebSocket live updates not wired in the frontend.** `services/map` exposes a WS endpoint; `apps/web` polls REST instead (simpler for V1, avoids WS proxy complexity in Next.js dev).
