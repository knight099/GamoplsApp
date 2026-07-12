# Overview Dashboard v1 — Design

## Context

`suggestions.md` (repo-root application review, 2026-07-10) flags as its #10 executive-summary finding: no Overview dashboard, no active-nav breadcrumbs, no way to reach a vehicle's detail page except via a map popup, and the post-login homepage is still marketing copy. Roadmap NEXT item 9 (§3–4) is "Overview dashboard + nav IA + design language v2." That item bundles five separable subsystems — new design tokens, a new component vocabulary, the new Overview page itself, a vehicle-detail-page redesign, and a merge of the two parallel component systems (`packages/ui` inline-style vs `apps/web/components/ui` shadcn). This spec covers the first slice only: the tokens, the core new components, the Overview page, and the nav/IA changes it needs. The vehicle-detail redesign and the component-system merge are explicitly out of scope (see Non-goals).

The user supplied two reference screenshots of a dark-themed ops console (an LLM-gateway product — pipelines, guardrails, model routing) as the concrete visual target for "fonts, colors, and design." The domain content of those screenshots (pipeline architecture, guardrail exceptions) has no analog in a vehicle-fleet app and is not being copied — only the visual system is: color palette, typography treatment, card/chip/KPI-tile anatomy, and table row style. Where this spec's font/color choices differ from `suggestions.md` §4.1–4.3's original prose (written without seeing the screenshots), the screenshots win — the one confirmed correction is status-chip text case (see Design tokens below).

This app already went through one token pass: `docs/superpowers/specs/2026-07-09-ui-ux-restyle-design.md` ("Phase 8.0") moved all color to the shadcn CSS-variable system and explicitly kept radius and Geist-Sans-only typography unchanged as a *non-goal* at the time. This spec is the deliberate revision `suggestions.md` §4.2 anticipated ("one deliberate revision to the 8.0 decision") — it does not redo Phase 8.0's token mechanism (that stays), it adjusts the values and adds a second typeface.

## Goals

- Re-skin the app's dark theme to match the reference's darker, flatter, "instrument panel" palette and tighter radius — via the existing shared CSS variables, so every existing page updates automatically with no per-component changes.
- Add Geist Mono for numeric/data text (KPI values, table numeric/time columns, uppercase section microlabels), matching the reference.
- Add two new shared components to `packages/ui` (matching that package's existing inline-style convention, since 26 of `apps/web`'s component files already import from it — it is the dominant system, not the newer `apps/web/components/ui` shadcn set): `StatusChip` and `KpiTile`.
- Replace the marketing-hero homepage with a real Overview dashboard for logged-in users: KPI row, vehicles status table, recent-activity feed. Logged-out visitors keep today's hero (this is what `suggestions.md` §4.4 specifies — hero becomes public-landing-only).
- Reorganize the sidebar into grouped sections, add an Overview entry, add a breadcrumb component wired into the vehicle detail page, add a fleet-health meter to the sidebar footer.

## Non-goals

- **No telemetry history.** KPI deltas, sparklines, and the 1H/24H/1W/1M time-range control are all gated on `telemetry_readings` (D-2, roadmap item 11, not built). `KpiTile` supports an optional `delta` prop so it's ready for that later, but nothing in this slice populates it. One KPI is substituted for this reason: "Distance today" (needs a start-of-day odometer baseline this app can't compute yet) becomes "Avg mileage (km/L)" (already computed and stored as `Asset.last_mileage_kmpl`).
- **No vehicle-detail-page redesign.** It was just reworked this session for the live-preview feature; the "instance detail" tab pattern from `suggestions.md` §4.4 is deferred to its own future slice.
- **No component-system consolidation.** `packages/ui` (inline-style, 26 importing files) and `apps/web/components/ui` (shadcn, used by `login`/`signup`/`org`/the old homepage) stay as two systems. This slice adds to `packages/ui` only; it does not migrate any of the 26 existing files' `Badge` usage to `StatusChip`, except `VehiclesTable` (see below) as the one flagship example inside the page this spec touches anyway. The other 25 files are `suggestions.md` C-6, a separate future cleanup.
- **No new `/alerts` or `/fleet/maintenance` routes.** `suggestions.md`'s proposed IA lists standalone "Alerts" and "Maintenance" nav items with count badges; both would need new cross-fleet list endpoints that don't exist today (alerts only exist as chat messages; maintenance records are fetched per-asset only). Out of scope here — the sidebar keeps today's five destinations, reorganized, plus the new Overview entry.
- **No cmdk command palette, toasts, confirm dialogs, or driver-assign redesign.** These are `suggestions.md` §3 polish items orthogonal to the Overview page itself.
- **No new backend endpoints or services.** Every data need is met by composing existing gateway routes (see Data sourcing below) — this slice is `apps/web`-only.

## Design tokens

Dark theme (`apps/web/app/globals.css`'s `.dark` block) — values below are the reference's near-black palette, already independently derived once in `suggestions.md` §4.1 from the same screenshots, expressed here as `oklch` to match this file's existing convention rather than mixing hex into an otherwise-`oklch` stylesheet:

| Token | Current | New (dark) | Rationale |
|---|---|---|---|
| `--background` | `oklch(0.145 0 0)` (~#1a1a1a) | `oklch(0.09 0 0)` (~#0B0C0E) | reference is near-black, flatter than current |
| `--card` | `oklch(0.205 0 0)` (~#2e2e2e) | `oklch(0.12 0 0)` (~#121316) | cards barely lift off the page in the reference — separation comes from the hairline border, not card brightness |
| `--card-raised` (new) | — | `oklch(0.145 0 0)` (~#17181C) | for panels that need to visually sit above a card-on-card context (none exist yet this slice, but `suggestions.md` calls for the token) |
| `--border` | `oklch(1 0 0 / 10%)` | `oklch(1 0 0 / 8%)` | stays alpha-over-background (adapts automatically); nudged slightly for the darker base |
| `--radius` | `0.625rem` (10px) | `0.375rem` (6px) | single base-token change; Tailwind's derived `sm`/`md`/`lg`/`xl` scale (already wired in `@theme inline`) cascades this to ~4px chips/inputs and ~6-8px cards app-wide with no new tokens |

Light theme (`:root` block) — lower priority (dark is the primary/default theme per Phase 8.0 and unchanged by this spec's mechanism) but updated for consistency:

| Token | Current | New (light) |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.98 0 0)` (~#F6F7F8) |
| `--card` | `oklch(1 0 0)` | unchanged (`#FFFFFF`) |
| `--card-raised` (new) | — | `oklch(0.985 0 0)` (~#FAFAFB) |
| `--border` | `oklch(0.922 0 0)` | unchanged |

Typography — add Geist Mono as a second typeface (Phase 8.0 kept Geist-Sans-only as a non-goal; this is the intentional revision):
- `apps/web/app/layout.tsx`: import `Geist_Mono` from `next/font/google` alongside the existing `Geist` import, expose as CSS variable `--font-mono`, add its `.variable` to the root `className` alongside the existing `geist.variable`.
- `apps/web/app/globals.css`'s `@theme inline` block: add `--font-mono: var(--font-mono);` next to the existing `--font-sans` mapping, making `font-mono` a usable Tailwind utility.
- New `.text-data` utility class (in `globals.css`, under `@layer base` or a new `@layer utilities` block): `font-mono` + `font-variant-numeric: tabular-nums` + a small positive `letter-spacing` for the uppercase-microlabel use. Applied to: KPI values, table numeric/timestamp columns, and uppercase section microlabels (e.g. a future "VEHICLES" column header) — **not** to `StatusChip` text (see below).

One correction to `suggestions.md`'s original (pre-screenshot) prose: it described status chips as "uppercase mono." The actual reference screenshots show status pill text (`Healthy`, `Blocked`, `Fallback`, `Retried`) as **sentence-case, small, regular sans** — not uppercase, not mono. `StatusChip` follows the screenshots. Uppercase mono is reserved for section/column microlabels (the reference's `1. INGRESS (ENTRY POINT)`-style headers), which this slice doesn't need yet but the `.text-data` utility is ready for.

## New components (`packages/ui`)

Both follow the package's existing inline-style convention (`style={{ ...vars... }}`, `var(--token, fallback)`), matching `Badge.tsx`/`Card.tsx` in the same directory — not the shadcn/Tailwind-className style, to avoid mixing conventions inside the one system that's actually used everywhere.

**`StatusChip`** (`packages/ui/src/StatusChip.tsx`) — small tinted rounded-rect, tone-based, sentence-case text:
```ts
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export interface StatusChipProps {
  tone: StatusTone;
  children: ReactNode;
}
```
Visual: ~4px radius (inherits the new `--radius-sm`), background at ~12% opacity of the tone color, 1px border at ~28% opacity of the tone color, text at a bright tint of the tone color, ~11-12px, medium weight, sentence-case (no `text-transform`). Tone→color mapping reuses the same five hues `Badge.tsx` already uses (success=emerald, warning=amber, danger=rose, info=blue, neutral=gray) for visual continuity with everything `Badge` still renders elsewhere this slice.

**`KpiTile`** (`packages/ui/src/KpiTile.tsx`) — icon + label header, large mono value, optional delta row:
```ts
export interface KpiTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: { label: string; tone: "positive" | "negative" };
}
```
Visual: `Card`-equivalent container (reuses `packages/ui`'s existing `Card`); header row = icon (14-16px, muted) + `label` (sentence-case, ~12-13px, muted-foreground); below it, `value` in `.text-data` treatment at ~28-32px semibold, with `unit` (if given) immediately after in smaller/dimmer text (e.g. `124` + `k`, `850` + `ms`); if `delta` is given, a bottom row with a colored triangle (▲/▼ derived from `tone`, not from parsing the label) + `delta.label` in that tone's color. No sparkline prop in this slice — there's no data source for one yet (see Non-goals), and the component isn't speculatively built for it since that would be exactly the kind of unbuilt-abstraction YAGNI warns against; it can be added when D-2 lands.

## Overview page (`apps/web/app/page.tsx`)

Restructured to branch on session, same top-level pattern as today's file:
- **Logged out:** unchanged — today's marketing hero stays, verbatim.
- **Logged in:** new dashboard content, replacing today's four-module grid.

Layout (top to bottom):
1. Heading row: `Overview` + one-line subtitle, matching the existing convention in e.g. `app/fleet/page.tsx` (`<h1>` + muted `<p>`).
2. KPI row — four `KpiTile`s, responsive grid (1 col mobile / 2 col tablet / 4 col desktop), no `delta` on any (Non-goals):
   - **Vehicles online** — count where `telemetry_updated_at` is within the last 5 minutes, `/` total vehicle count.
   - **Avg fleet health** — mean of `health_score` across all vehicles; `—` if zero vehicles.
   - **Active alerts (24h)** — count of alert-bridge messages (see Data sourcing) created in the last 24 hours, computed from the *full* fetched message list for that channel — not from the 20-item display cap described below, which is a rendering slice applied after this count and must not feed it (a channel with >20 alerts in 24h would otherwise under-count).
   - **Avg mileage (km/L)** — mean of `last_mileage_kmpl` across vehicles that have a non-null value (vehicles with no reading yet are excluded from the average, not treated as zero); `—` if none.
3. Two-column content area (stacks to one column below `lg`):
   - **Left (~2/3 width): Vehicles.** Table modeled on the existing `VehiclesTable`, migrated to use `StatusChip` instead of `Badge` for the health column (the one flagship migration this slice does — see Non-goals). Empty state: "No vehicles yet" + a link to `/fleet`.
   - **Right (~1/3 width): Recent activity.** The merged events feed (see Data sourcing) — each row: relative timestamp (`.text-data`), one-line message, a `StatusChip`. Empty state: "No recent activity."
   - If there are zero vehicles **and** zero events, collapse both panels into one centered "Get started — add your first vehicle" prompt instead of two empty panels.
4. Polling: every 15s (not the 5s used on the vehicle-detail live-preview page — this is a glance-level dashboard composing three endpoints including a two-hop channel/message fetch, not a single asset being actively watched). Uses the same `isFirstLoad` ref pattern already established on the vehicle-detail page, so refreshes don't re-trigger the full-page loading spinner.

### Data sourcing (all via existing gateway routes — no backend changes)

- **Vehicles:** `listVehicles()` — already exists (`apps/web/components/fleet/api.ts`).
- **Suggested-task events:** `listTasks()` (`apps/web/components/board/api.ts`), filtered client-side to `status === "draft"`. Confirmed via `services/board/src/task-suggested-handler.ts`: every `TaskSuggested`-originated task is created with `status: "draft"` and nothing else ever sets or reverts to `draft` — this is already a reliable "system-suggested" marker, no schema change needed.
- **Alert events:** `fetchChannels()` (`apps/web/components/chat/api.ts`), filtered client-side to `fleet_id === session.fleet_id`, take the earliest by `createdAt` (the alert-bridge always posts to "the earliest-created channel for that org/fleet" per `services/chat/src/alert-bridge.ts` — there is at most one relevant channel, so this is two calls total, not N+1: one `fetchChannels()`, then one `fetchMessages(channelId)` for that single channel). Messages filtered to `senderId === "system:alert-bridge"`. Each message's `body` is `[SEVERITY] message text` (set by `AlertBridge.handleAlert`) — a small new pure function `parseAlertBody(body: string): { severity: string | null; message: string }` strips the bracket for display and maps severity→`StatusTone`.
- **Merge:** tasks and parsed alert messages combined into one list, sorted by timestamp descending, capped to 20 items **for display only**. A small pure helper (e.g. `apps/web/lib/events-feed.ts`) does the merge/sort/cap so it's unit-testable in isolation from the page component; the "Active alerts (24h)" KPI is computed separately, upstream of this cap (see KPI row above), from the uncapped message list.

### Shared fleet-health calculation

Avg-health and "needs attention" count are needed in two places this slice (the KPI row and the new sidebar meter, below) — factored into one pure function up front rather than duplicated (the review already flags this exact kind of duplication as C-1 tech debt):
```ts
// apps/web/lib/fleet-health.ts
export function computeFleetHealth(vehicles: Asset[]): { avg: number | null; needsAttentionCount: number };
```
"Needs attention" = `health_score < 50`, matching the existing `healthTone()` danger threshold used elsewhere.

## Navigation & IA changes

**Sidebar grouping** (`apps/web/components/sidebar-nav.tsx`) — `NAV_LINKS` becomes three labeled groups, rendered as separate sections with a small uppercase `.text-data`-styled group heading:
```
OPERATIONS
  Overview → /       (new)
  Map      → /map

FLEET
  Fleet    → /fleet  (unchanged — still the one page with Vehicles/Drivers tabs; suggestions.md's proposed split into separate "Vehicles" and "Drivers" nav items is not done here, since today they're one page with client-side tab state, and splitting them is a larger change than this slice's IA scope)

WORKSPACE
  Tasks      → /board   (label rename from "Board" — route unchanged)
  Chat       → /chat
  Documents  → /hub     (label rename from "Hub" — route unchanged)
```
Route paths are unchanged for the renamed items — only the visible label changes. A full route rename (`/board`→`/tasks`, `/hub`→`/documents`) would touch every `Link`, test, and the gateway proxy's path mapping for no functional gain; can be done later if wanted.

**Breadcrumb** — new small presentational component, `packages/ui/src/Breadcrumb.tsx` (it has zero app-specific routing knowledge — just a `{ label: string; href?: string }[]` prop rendered as linked segments — so it belongs alongside `StatusChip`/`KpiTile` in the shared package, not in `apps/web`), rendered in the reference's mono-microcap style (`.text-data`, muted, `/` separators, last segment un-linked). Wired into the vehicle detail page only this slice: `Fleet / <vehicle display_label>` (two segments — "Fleet" links to `/fleet`; there's no separate "Vehicles" route to link as a middle segment, so the three-segment form `suggestions.md` sketched is simplified to two).

**Fleet health meter** (new `apps/web/components/fleet-health-meter.tsx`, client component, sidebar footer in `layout.tsx` next to `FleetSwitcher`) — fetches `listVehicles()` independently (same pattern `FleetSwitcher` already uses in that spot), reuses `computeFleetHealth()`, renders a small segmented bar + `"{avg}% · {n} vehicle(s) need attention"` text. Refreshes every 30s (footer chrome, not time-critical).

## Testing

- `StatusChip` / `KpiTile`: component tests in `packages/ui/src/__tests__/components.test.tsx` (existing file — add cases), covering tone→color mapping and the optional `delta`/`unit` rendering.
- `computeFleetHealth`: unit tests — empty fleet, all-healthy, mixed, all-below-threshold.
- `parseAlertBody` and the events-feed merge/sort/cap helper: unit tests in isolation, including the malformed-body (`no brackets`) fallback case.
- Overview page: component test mocking the three data calls (`listVehicles`, `listTasks`, `fetchChannels`+`fetchMessages`) — loading state, empty state (zero vehicles and zero events → collapsed prompt), populated state (KPI values match hand-computed expectations from fixture data, events sorted correctly).
- `SidebarNav`: existing tests updated for the new grouped structure and renamed labels; active-state assertions extended to the new `/` entry.
- Manual/visual: after implementation, run `next build && next start` and check the Overview page, sidebar, and at least one existing page (e.g. `/fleet`) in a browser to confirm the token change (darker background/cards, tighter radius, mono numerals) reads correctly and nothing regressed contrast-wise — type checks and unit tests verify logic, not that the re-skin actually looks right.

## Open follow-ups (explicitly not this slice)

Recorded here so they aren't lost, not because they're blocking: full `Badge`→`StatusChip` migration across the other 25 importing files (C-6); vehicle-detail-page "instance detail" redesign; KPI deltas/sparklines/time-range control once D-2 lands; standalone Alerts/Maintenance nav destinations once their list endpoints exist; cmdk palette, toasts, confirm dialogs, driver-assign redesign.
