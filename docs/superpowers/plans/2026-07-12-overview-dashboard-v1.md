# Overview Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `apps/web`'s dark theme to match the reference screenshots (darker/flatter palette, tighter radius, Geist Mono for data), add `StatusChip`/`KpiTile`/`Breadcrumb` to `packages/ui`, and replace the marketing-hero homepage with a real Overview dashboard (KPI row, vehicles table, merged activity feed) plus a reorganized sidebar.

**Architecture:** Design tokens live in `apps/web/app/globals.css` and cascade to every existing page automatically (no per-component changes needed for the re-skin itself). Three new presentational primitives go in `packages/ui` (matching that package's existing inline-style convention — it's the dominant system, imported by 26 of `apps/web`'s component files). The Overview page composes two new pure data-shaping helpers (`apps/web/lib/fleet-health.ts`, `apps/web/lib/events-feed.ts`) with three *already-existing* gateway API clients (`fleetApi.listVehicles`, `boardApi.listTasks`, `chatApi.fetchChannels`/`fetchMessages`) — no backend changes anywhere in this plan.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 (`@theme inline` token system), `packages/ui` (inline-style React components), Vitest + React Testing Library, `lucide-react` icons, `next/font/google`.

## Global Constraints

- Dark theme tokens (`apps/web/app/globals.css`'s `.dark` block): `--background: oklch(0.09 0 0)`, `--card: oklch(0.12 0 0)`, `--card-raised: oklch(0.145 0 0)` (new token), `--border: oklch(1 0 0 / 8%)`.
- Light theme tokens (`:root` block): `--background: oklch(0.98 0 0)`, `--card-raised: oklch(0.985 0 0)` (new token); `--card`/`--border` unchanged.
- `--radius` changes from `0.625rem` to `0.375rem` — a single base-token edit; the existing derived `sm`/`md`/`lg`/`xl` scale in `@theme inline` cascades this everywhere with no other token changes.
- Add Geist Mono (`--font-mono`) via `next/font/google`, used for KPI values, numeric/timestamp table cells, and uppercase section microlabels — **never** for `StatusChip` text, which is sentence-case regular sans (confirmed from the reference screenshots — this corrects `suggestions.md`'s original "uppercase mono" guess for chips).
- No new backend endpoints or services anywhere in this plan — every data need is met by `fleetApi.listVehicles()`, `boardApi.listTasks()`, `chatApi.fetchChannels()`/`fetchMessages()`, all of which already exist.
- Nav label renames ("Board"→"Tasks", "Hub"→"Documents") change the visible label only — routes stay `/board` and `/hub`.
- No KPI deltas or sparklines this slice (no data source yet) — `KpiTile`'s `delta` prop exists but nothing populates it.
- Every new `packages/ui` file uses that package's inline-style convention (`style={{ ...var(--token, fallback)... }}`), not Tailwind classNames — match `Badge.tsx`/`Card.tsx` exactly.
- `packages/ui` test/import files use explicit `.js` extensions (e.g. `../Badge.js`); `apps/web` test/import files do not (e.g. `../VehiclesPanel`). Match whichever convention the file you're in already uses.

---

### Task 1: Design tokens, Geist Mono, and the `.text-data` utility

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--card-raised`, `--font-mono` (usable as Tailwind's `bg-card-raised`/`font-mono`), and a `.text-data` utility class — all later tasks may use these.

This task has no unit-testable logic (it's CSS values and a font import) — verified by a production build instead.

- [ ] **Step 1: Update the `@theme inline` block**

In `apps/web/app/globals.css`, find:
```css
@theme inline {
    --font-heading: var(--font-sans);
    --font-sans: var(--font-sans);
```
Replace with:
```css
@theme inline {
    --font-heading: var(--font-sans);
    --font-sans: var(--font-sans);
    --font-mono: var(--font-mono);
```
Then find:
```css
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
```
Replace with:
```css
    --color-card-foreground: var(--card-foreground);
    --color-card-raised: var(--card-raised);
    --color-card: var(--card);
```

- [ ] **Step 2: Update the `:root` (light theme) block**

Find:
```css
:root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
```
Replace with:
```css
:root {
    --background: oklch(0.98 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-raised: oklch(0.985 0 0);
    --card-foreground: oklch(0.145 0 0);
```
Then find:
```css
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.511 0.262 276.966);
    --chart-1: oklch(0.87 0 0);
```
This block is unchanged — `--border` stays `oklch(0.922 0 0)` in light mode. Leave it as-is (no edit needed here; this step confirms there's nothing to change in this sub-block).

Finally, in the same `:root` block, find:
```css
    --radius: 0.625rem;
```
Replace with:
```css
    --radius: 0.375rem;
```

- [ ] **Step 3: Update the `.dark` block**

Find:
```css
.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
```
Replace with:
```css
.dark {
    --background: oklch(0.09 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.12 0 0);
    --card-raised: oklch(0.145 0 0);
    --card-foreground: oklch(0.985 0 0);
```
Then find:
```css
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
```
Replace with:
```css
    --border: oklch(1 0 0 / 8%);
    --input: oklch(1 0 0 / 15%);
```

- [ ] **Step 4: Add the `.text-data` utility class**

At the end of `apps/web/app/globals.css`, after the existing `@layer base { ... }` block, add:
```css

@layer utilities {
  .text-data {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
}
```

- [ ] **Step 5: Add the Geist Mono font in `layout.tsx`**

In `apps/web/app/layout.tsx`, find:
```tsx
import { Geist } from "next/font/google";
```
Replace with:
```tsx
import { Geist, Geist_Mono } from "next/font/google";
```
Find:
```tsx
const geist = Geist({subsets:['latin'],variable:'--font-sans'});
```
Replace with:
```tsx
const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});
```
Find:
```tsx
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
```
Replace with:
```tsx
    <html lang="en" className={cn("font-sans", geist.variable, geistMono.variable)} suppressHydrationWarning>
```

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter web build`
Expected: build succeeds with no CSS or type errors. (There is no dev server needed for this check — a production build is sufficient to catch a bad token reference or font-import typo.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx
git commit -m "feat(web): darker/flatter dark-theme tokens, tighter radius, Geist Mono (suggestions.md NEXT-9)"
```

---

### Task 2: `StatusChip` component

**Files:**
- Create: `packages/ui/src/StatusChip.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/__tests__/components.test.tsx`

**Interfaces:**
- Produces: `StatusChip({ tone: StatusTone, children, ...rest }: StatusChipProps)`, `export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"`. Later tasks (VehiclesTable, EventsFeed) import `StatusChip` and `StatusTone` from `@gamopls/ui`.

- [ ] **Step 1: Write the failing tests**

In `packages/ui/src/__tests__/components.test.tsx`, add to the imports at the top:
```tsx
import { StatusChip } from "../StatusChip.js";
```
Add inside the existing `describe("@gamopls/ui primitives", ...)` block (anywhere after the `Badge` test is fine):
```tsx
  it("renders StatusChip with a tone", () => {
    render(<StatusChip tone="danger">Offline</StatusChip>);
    const chip = screen.getByText("Offline");
    expect(chip.getAttribute("data-tone")).toBe("danger");
  });

  it("renders StatusChip with a different tone", () => {
    render(<StatusChip tone="success">Online</StatusChip>);
    expect(screen.getByText("Online").getAttribute("data-tone")).toBe("success");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: FAIL — `Failed to resolve import "../StatusChip.js"`.

- [ ] **Step 3: Implement `StatusChip`**

Create `packages/ui/src/StatusChip.tsx`:
```tsx
import type { HTMLAttributes, ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  children: ReactNode;
}

const TONE_STYLES: Record<StatusTone, React.CSSProperties> = {
  neutral: {
    background: "var(--muted)",
    color: "var(--muted-foreground)",
    borderColor: "var(--border)",
  },
  success: {
    background: "rgba(16, 185, 129, 0.15)",
    color: "#34d399",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  warning: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#fbbf24",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  danger: {
    background: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  info: {
    background: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
};

/**
 * Status pill matching the reference design: sentence-case (not uppercase
 * or mono), small, tinted. Supersedes ad-hoc Badge-tone usage for
 * entity/event status going forward; Badge itself is unchanged.
 */
export function StatusChip({ tone, style, children, ...rest }: StatusChipProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-sm, 0.25rem)",
        fontSize: "0.75rem",
        fontWeight: 500,
        border: "1px solid",
        ...TONE_STYLES[tone],
        ...style,
      }}
      data-tone={tone}
      {...rest}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Export it from the package**

In `packages/ui/src/index.ts`, add after the existing `Badge` export block:
```ts
export { StatusChip } from "./StatusChip.js";
export type { StatusChipProps, StatusTone } from "./StatusChip.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: PASS (7 tests: the original 5 plus the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/StatusChip.tsx packages/ui/src/index.ts packages/ui/src/__tests__/components.test.tsx
git commit -m "feat(ui): add StatusChip primitive matching the reference design's chip style"
```

---

### Task 3: `KpiTile` component

**Files:**
- Create: `packages/ui/src/KpiTile.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: `Card` from `./Card.js` (already exists).
- Produces: `KpiTile({ icon, label, value, unit?, delta? }: KpiTileProps)`, `export interface KpiTileDelta { label: string; tone: "positive" | "negative" }`. The Overview KPI row task imports this.

- [ ] **Step 1: Write the failing tests**

In `packages/ui/src/__tests__/components.test.tsx`, add to imports:
```tsx
import { KpiTile } from "../KpiTile.js";
```
Add inside the `describe` block:
```tsx
  it("renders KpiTile with label, value, and unit", () => {
    render(<KpiTile icon={<span>icon</span>} label="Avg fleet health" value="87" unit="%" />);
    expect(screen.getByText("Avg fleet health")).toBeDefined();
    expect(screen.getByText("87")).toBeDefined();
    expect(screen.getByText("%")).toBeDefined();
  });

  it("renders KpiTile's delta row only when delta is provided", () => {
    const { rerender } = render(<KpiTile icon={<span>icon</span>} label="Active alerts" value="3" />);
    expect(screen.queryByText(/vs yesterday/)).toBeNull();
    rerender(
      <KpiTile
        icon={<span>icon</span>}
        label="Active alerts"
        value="3"
        delta={{ label: "+1 vs yesterday", tone: "negative" }}
      />,
    );
    expect(screen.getByText(/\+1 vs yesterday/)).toBeDefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: FAIL — `Failed to resolve import "../KpiTile.js"`.

- [ ] **Step 3: Implement `KpiTile`**

Create `packages/ui/src/KpiTile.tsx`:
```tsx
import type { ReactNode } from "react";
import { Card } from "./Card.js";

export interface KpiTileDelta {
  label: string;
  tone: "positive" | "negative";
}

export interface KpiTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: KpiTileDelta;
}

const DELTA_COLOR: Record<KpiTileDelta["tone"], string> = {
  positive: "#34d399",
  negative: "#fca5a5",
};

const DELTA_ARROW: Record<KpiTileDelta["tone"], string> = {
  positive: "▲",
  negative: "▼",
};

const DATA_FONT = "var(--font-mono, ui-monospace, monospace)";

/**
 * KPI stat tile matching the reference design: icon + label header, large
 * mono value with an optional unit suffix, optional delta row. `delta` is
 * unused by every call site as of this component landing — populating it
 * needs telemetry history (suggestions.md D-2) that doesn't exist yet.
 */
export function KpiTile({ icon, label, value, unit, delta }: KpiTileProps) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)" }}>
        {icon}
        <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--foreground)", fontFamily: DATA_FONT, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "0.9375rem", color: "var(--muted-foreground)", fontFamily: DATA_FONT }}>
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
          <span style={{ color: DELTA_COLOR[delta.tone], fontWeight: 600 }}>
            {DELTA_ARROW[delta.tone]} {delta.label}
          </span>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Export it from the package**

In `packages/ui/src/index.ts`, add after the `StatusChip` export block from Task 2:
```ts
export { KpiTile } from "./KpiTile.js";
export type { KpiTileDelta, KpiTileProps } from "./KpiTile.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: PASS (9 tests total).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/KpiTile.tsx packages/ui/src/index.ts packages/ui/src/__tests__/components.test.tsx
git commit -m "feat(ui): add KpiTile primitive"
```

---

### Task 4: `Breadcrumb` component

**Files:**
- Create: `packages/ui/src/Breadcrumb.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/__tests__/components.test.tsx`

**Interfaces:**
- Produces: `Breadcrumb({ segments }: BreadcrumbProps)`, `export interface BreadcrumbSegment { label: string; href?: string }`. The vehicle-detail-page task (Task 10) imports this.

- [ ] **Step 1: Write the failing test**

In `packages/ui/src/__tests__/components.test.tsx`, add to imports:
```tsx
import { Breadcrumb } from "../Breadcrumb.js";
```
Add inside the `describe` block:
```tsx
  it("renders Breadcrumb segments with the last one unlinked", () => {
    render(
      <Breadcrumb
        segments={[
          { label: "Fleet", href: "/fleet" },
          { label: "TN-09-AB-1234" },
        ]}
      />,
    );
    const fleetLink = screen.getByText("Fleet");
    expect(fleetLink.tagName).toBe("A");
    expect(fleetLink.getAttribute("href")).toBe("/fleet");
    const last = screen.getByText("TN-09-AB-1234");
    expect(last.tagName).toBe("SPAN");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: FAIL — `Failed to resolve import "../Breadcrumb.js"`.

- [ ] **Step 3: Implement `Breadcrumb`**

Create `packages/ui/src/Breadcrumb.tsx`:
```tsx
import type { CSSProperties } from "react";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/**
 * Breadcrumb trail in the reference design's mono-microcap style. Renders
 * plain `<a>` tags (not next/link) since packages/ui has no dependency on
 * Next.js — breadcrumb navigation is low-traffic enough that a full page
 * load instead of client-side prefetch is an acceptable trade.
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const textStyle: CSSProperties = {
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          color: isLast ? "var(--foreground)" : "var(--muted-foreground)",
        };
        return (
          <span key={`${segment.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            {index > 0 && <span style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>/</span>}
            {segment.href && !isLast ? (
              <a href={segment.href} style={{ ...textStyle, textDecoration: "none" }}>
                {segment.label}
              </a>
            ) : (
              <span style={textStyle}>{segment.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Export it from the package**

In `packages/ui/src/index.ts`, add after the `KpiTile` export block from Task 3:
```ts
export { Breadcrumb } from "./Breadcrumb.js";
export type { BreadcrumbProps, BreadcrumbSegment } from "./Breadcrumb.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @gamopls/ui test -- components.test.tsx`
Expected: PASS (10 tests total).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/Breadcrumb.tsx packages/ui/src/index.ts packages/ui/src/__tests__/components.test.tsx
git commit -m "feat(ui): add Breadcrumb primitive"
```

---

### Task 5: `computeFleetHealth` shared helper

**Files:**
- Create: `apps/web/lib/fleet-health.ts`
- Test: `apps/web/lib/__tests__/fleet-health.test.ts`

**Interfaces:**
- Consumes: `Asset` type from `@/components/fleet/types` (already exists).
- Produces: `computeFleetHealth(vehicles: Asset[]): { avg: number | null; needsAttentionCount: number }`. Used by Task 8 (FleetHealthMeter) and Task 13 (OverviewDashboard).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/__tests__/fleet-health.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeFleetHealth } from "../fleet-health";
import type { Asset } from "@/components/fleet/types";

function makeAsset(healthScore: number): Asset {
  return {
    id: `asset-${healthScore}-${Math.random()}`,
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: "Test",
    health_score: healthScore,
    telemetry: {},
    telemetry_updated_at: null,
    last_mileage_kmpl: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("computeFleetHealth", () => {
  it("returns a null average and zero count for an empty fleet", () => {
    expect(computeFleetHealth([])).toEqual({ avg: null, needsAttentionCount: 0 });
  });

  it("averages health scores across vehicles", () => {
    const result = computeFleetHealth([makeAsset(80), makeAsset(90), makeAsset(100)]);
    expect(result.avg).toBe(90);
  });

  it("counts vehicles below the needs-attention threshold (50)", () => {
    const result = computeFleetHealth([makeAsset(90), makeAsset(40), makeAsset(20)]);
    expect(result.needsAttentionCount).toBe(2);
  });

  it("rounds the average to the nearest whole number", () => {
    const result = computeFleetHealth([makeAsset(80), makeAsset(81)]);
    expect(result.avg).toBe(81);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- fleet-health.test.ts`
Expected: FAIL — `Failed to resolve import "../fleet-health"`.

- [ ] **Step 3: Implement `computeFleetHealth`**

Create `apps/web/lib/fleet-health.ts`:
```ts
import type { Asset } from "@/components/fleet/types";

const NEEDS_ATTENTION_THRESHOLD = 50;

export interface FleetHealth {
  avg: number | null;
  needsAttentionCount: number;
}

/**
 * Shared fleet-health aggregate — used by both the Overview KPI row and the
 * sidebar fleet-health meter, factored out once rather than duplicated
 * (suggestions.md C-1 flags this exact class of duplication).
 */
export function computeFleetHealth(vehicles: Asset[]): FleetHealth {
  if (vehicles.length === 0) {
    return { avg: null, needsAttentionCount: 0 };
  }
  const total = vehicles.reduce((sum, v) => sum + v.health_score, 0);
  const needsAttentionCount = vehicles.filter((v) => v.health_score < NEEDS_ATTENTION_THRESHOLD).length;
  return { avg: Math.round(total / vehicles.length), needsAttentionCount };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- fleet-health.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/fleet-health.ts apps/web/lib/__tests__/fleet-health.test.ts
git commit -m "feat(web): add computeFleetHealth shared helper"
```

---

### Task 6: `parseAlertBody` and the events-feed merge helper

**Files:**
- Create: `apps/web/lib/events-feed.ts`
- Test: `apps/web/lib/__tests__/events-feed.test.ts`

**Interfaces:**
- Consumes: `StatusTone` from `@gamopls/ui` (Task 2), `Task` type from `@/components/board/types`, `ChatMessage` type from `@/components/chat/types` (both already exist).
- Produces: `parseAlertBody(body: string): { severity: string | null; message: string }`, `filterAlertMessages(messages: ChatMessage[]): ChatMessage[]`, `mergeEvents(tasks: Task[], messages: ChatMessage[], limit?: number): FeedEvent[]`, `export interface FeedEvent { id: string; timestamp: string; message: string; chipLabel: string; tone: StatusTone }`, `export const ALERT_BRIDGE_SENDER_ID = "system:alert-bridge"`. Used by Task 11 (EventsFeed) and Task 13 (OverviewDashboard).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/__tests__/events-feed.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filterAlertMessages, mergeEvents, messageToFeedEvent, parseAlertBody, taskToFeedEvent } from "../events-feed";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    mission_id: null,
    title: "oil_change due for asset asset-1",
    description: "...",
    status: "draft",
    asset_id: "asset-1",
    created_at: "2026-07-12T10:00:00.000Z",
    updated_at: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    channelId: "channel-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    senderType: "system",
    senderId: "system:alert-bridge",
    body: "[CRITICAL] Battery below 10%",
    createdAt: "2026-07-12T11:00:00.000Z",
    ...overrides,
  };
}

describe("parseAlertBody", () => {
  it("splits a bracketed severity prefix from the message", () => {
    expect(parseAlertBody("[CRITICAL] Battery below 10%")).toEqual({
      severity: "CRITICAL",
      message: "Battery below 10%",
    });
  });

  it("falls back to treating the whole body as the message when there's no bracket", () => {
    expect(parseAlertBody("plain text with no prefix")).toEqual({
      severity: null,
      message: "plain text with no prefix",
    });
  });
});

describe("filterAlertMessages", () => {
  it("keeps only messages from the alert-bridge sender", () => {
    const messages = [makeMessage(), makeMessage({ id: "msg-2", senderId: "user-1", body: "hi" })];
    expect(filterAlertMessages(messages)).toHaveLength(1);
  });
});

describe("taskToFeedEvent / messageToFeedEvent", () => {
  it("maps a draft task to a Suggested/info feed event", () => {
    const event = taskToFeedEvent(makeTask());
    expect(event.chipLabel).toBe("Suggested");
    expect(event.tone).toBe("info");
    expect(event.message).toBe("oil_change due for asset asset-1");
  });

  it("maps a critical alert message to a danger-tone feed event", () => {
    const event = messageToFeedEvent(makeMessage());
    expect(event.tone).toBe("danger");
    expect(event.chipLabel).toBe("Critical");
    expect(event.message).toBe("Battery below 10%");
  });

  it("falls back to neutral tone for an unrecognized severity prefix", () => {
    const event = messageToFeedEvent(makeMessage({ body: "[UNKNOWN] something" }));
    expect(event.tone).toBe("neutral");
  });
});

describe("mergeEvents", () => {
  it("sorts merged tasks and alert messages newest-first", () => {
    const tasks = [makeTask({ id: "t1", created_at: "2026-07-12T09:00:00.000Z" })];
    const messages = [makeMessage({ id: "m1", createdAt: "2026-07-12T12:00:00.000Z" })];
    const result = mergeEvents(tasks, messages);
    expect(result.map((e) => e.id)).toEqual(["message:m1", "task:t1"]);
  });

  it("excludes non-alert-bridge messages", () => {
    const messages = [makeMessage({ senderId: "user-1" })];
    expect(mergeEvents([], messages)).toHaveLength(0);
  });

  it("caps the result to the given limit", () => {
    const tasks = Array.from({ length: 25 }, (_, i) =>
      makeTask({ id: `t${i}`, created_at: `2026-07-12T${String(i).padStart(2, "0")}:00:00.000Z` }),
    );
    expect(mergeEvents(tasks, [])).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- events-feed.test.ts`
Expected: FAIL — `Failed to resolve import "../events-feed"`.

- [ ] **Step 3: Implement the events-feed helpers**

Create `apps/web/lib/events-feed.ts`:
```ts
import type { StatusTone } from "@gamopls/ui";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";

export const ALERT_BRIDGE_SENDER_ID = "system:alert-bridge";

export interface FeedEvent {
  id: string;
  timestamp: string;
  message: string;
  chipLabel: string;
  tone: StatusTone;
}

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: "danger",
  WARNING: "warning",
  INFO: "info",
};

/**
 * Splits an alert-bridge message body back into its parts for display.
 * `AlertBridge.handleAlert` (services/chat/src/alert-bridge.ts) formats
 * every alert-originated message as `[SEVERITY] message text`, where
 * SEVERITY is one of the three values in `alertSeveritySchema`
 * (packages/event-schemas), uppercased. Falls back to treating the whole
 * body as the message, with no detected severity, if the leading bracket
 * is missing or unrecognized — this feed must degrade gracefully on a
 * message shape it didn't itself produce, not throw.
 */
export function parseAlertBody(body: string): { severity: string | null; message: string } {
  const match = /^\[([A-Z]+)\]\s*(.*)$/.exec(body);
  if (!match) return { severity: null, message: body };
  return { severity: match[1], message: match[2] };
}

function alertTone(severity: string | null): StatusTone {
  return (severity && SEVERITY_TONE[severity]) ?? "neutral";
}

/** Keeps only messages posted by the alert bridge (services/chat/src/alert-bridge.ts's ALERT_BRIDGE_SENDER_ID) — every other message in a channel is regular chat, not an alert. */
export function filterAlertMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.senderId === ALERT_BRIDGE_SENDER_ID);
}

export function taskToFeedEvent(task: Task): FeedEvent {
  return {
    id: `task:${task.id}`,
    timestamp: task.created_at,
    message: task.title,
    chipLabel: "Suggested",
    tone: "info",
  };
}

export function messageToFeedEvent(message: ChatMessage): FeedEvent {
  const { severity, message: text } = parseAlertBody(message.body);
  return {
    id: `message:${message.id}`,
    timestamp: message.createdAt,
    message: text,
    chipLabel: severity ? severity.charAt(0) + severity.slice(1).toLowerCase() : "Alert",
    tone: alertTone(severity),
  };
}

/**
 * Merges suggested-task and alert-message events into one feed, newest
 * first, capped for display only. Callers that need a *count* (e.g. the
 * Overview page's "Active alerts (24h)" KPI) must compute it from
 * `filterAlertMessages`'s full output, not from this function's
 * already-capped result — a channel with more than `limit` alerts in the
 * relevant window would otherwise under-count.
 */
export function mergeEvents(tasks: Task[], messages: ChatMessage[], limit = 20): FeedEvent[] {
  const events = [...tasks.map(taskToFeedEvent), ...filterAlertMessages(messages).map(messageToFeedEvent)];
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- events-feed.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/events-feed.ts apps/web/lib/__tests__/events-feed.test.ts
git commit -m "feat(web): add events-feed merge/parse helpers"
```

---

### Task 7: Migrate `VehiclesTable` to `StatusChip`

**Files:**
- Modify: `apps/web/components/fleet/VehiclesTable.tsx`
- Test: Create `apps/web/components/fleet/__tests__/VehiclesTable.test.tsx` (no test file exists for this component today)

**Interfaces:**
- Consumes: `StatusChip` from `@gamopls/ui` (Task 2).
- No change to `VehiclesTableProps` — this task only changes the health-column chip's implementation, and is reused as-is by Task 13's Overview page.

This task is a like-for-like refactor (`Badge` and `StatusChip` both set `data-tone` on the rendered element), so there's no *new* observable behavior to red/green — the test below is a **characterization test**: written first, confirmed to pass against the current `Badge`-based code (proving it accurately describes today's behavior), then confirmed to still pass after the migration (proving the refactor didn't change anything observable).

- [ ] **Step 1: Write the characterization tests**

Create `apps/web/components/fleet/__tests__/VehiclesTable.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VehiclesTable } from "../VehiclesTable";
import type { Asset } from "../types";

expect.extend(jestDomMatchers);

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: "TN-09-AB-1234",
    health_score: 85,
    telemetry: {},
    telemetry_updated_at: null,
    last_mileage_kmpl: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("VehiclesTable", () => {
  afterEach(() => cleanup());

  it("shows the empty state when there are no vehicles", () => {
    render(<VehiclesTable vehicles={[]} />);
    expect(screen.getByText(/No vehicles yet/)).toBeDefined();
  });

  it("renders a success-tone status chip for a healthy vehicle", () => {
    render(<VehiclesTable vehicles={[makeAsset({ health_score: 90 })]} />);
    expect(screen.getByText("90").getAttribute("data-tone")).toBe("success");
  });

  it("renders a danger-tone chip for a low health score", () => {
    render(<VehiclesTable vehicles={[makeAsset({ health_score: 30 })]} />);
    expect(screen.getByText("30").getAttribute("data-tone")).toBe("danger");
  });

  it("links each vehicle row to its detail page", () => {
    render(<VehiclesTable vehicles={[makeAsset({ id: "asset-42", display_label: "TN-42" })]} />);
    const link = screen.getByRole("link", { name: "TN-42" });
    expect(link.getAttribute("href")).toBe("/fleet/vehicles/asset-42");
  });
});
```

- [ ] **Step 2: Run the tests against the current `Badge`-based code to confirm they pass**

Run: `pnpm --filter web test -- VehiclesTable.test.tsx`
Expected: PASS (4 tests) — `Badge` already sets `data-tone`, so this confirms the test file correctly characterizes today's behavior before any code changes.

- [ ] **Step 3: Migrate to `StatusChip`**

In `apps/web/components/fleet/VehiclesTable.tsx`, find:
```tsx
import { Badge } from "@gamopls/ui";
```
Replace with:
```tsx
import { StatusChip } from "@gamopls/ui";
```
Find:
```tsx
            <td className="py-2">
              <Badge tone={healthTone(v.health_score)}>{v.health_score}</Badge>
            </td>
```
Replace with:
```tsx
            <td className="py-2">
              <StatusChip tone={healthTone(v.health_score)}>{v.health_score}</StatusChip>
            </td>
```

- [ ] **Step 4: Run the tests again to confirm the refactor preserved behavior**

Run: `pnpm --filter web test -- VehiclesTable.test.tsx`
Expected: PASS (4 tests) — same result as Step 2, now against `StatusChip` instead of `Badge`, confirming the migration changed nothing observable.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/fleet/VehiclesTable.tsx apps/web/components/fleet/__tests__/VehiclesTable.test.tsx
git commit -m "refactor(web): migrate VehiclesTable's health chip from Badge to StatusChip"
```

---

### Task 8: `FleetHealthMeter` component, wired into the sidebar footer

**Files:**
- Create: `apps/web/components/fleet-health-meter.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/components/__tests__/fleet-health-meter.test.tsx`

**Interfaces:**
- Consumes: `fleetApi.listVehicles()` from `@/components/fleet/api` (already exists), `computeFleetHealth` from `@/lib/fleet-health` (Task 5).
- Produces: `FleetHealthMeter()` — a no-props client component. Rendered directly in `layout.tsx`, no other task depends on it.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/__tests__/fleet-health-meter.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetHealthMeter } from "../fleet-health-meter";
import * as fleetApi from "@/components/fleet/api";
import type { Asset } from "@/components/fleet/types";

expect.extend(jestDomMatchers);
vi.mock("@/components/fleet/api");

function makeAsset(healthScore: number, id: string): Asset {
  return {
    id,
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: id,
    health_score: healthScore,
    telemetry: {},
    telemetry_updated_at: null,
    last_mileage_kmpl: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("FleetHealthMeter", () => {
  afterEach(() => cleanup());

  it("renders nothing when the fleet has zero vehicles", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    render(<FleetHealthMeter />);
    await waitFor(() => expect(fleetApi.listVehicles).toHaveBeenCalled());
    expect(screen.queryByTestId("fleet-health-meter")).toBeNull();
  });

  it("shows the average health and needs-attention count once loaded", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([makeAsset(90, "a1"), makeAsset(30, "a2")]);
    render(<FleetHealthMeter />);
    expect(await screen.findByText(/Fleet health 60%/)).toBeDefined();
    expect(screen.getByText(/1 vehicle needs attention/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- fleet-health-meter.test.tsx`
Expected: FAIL — `Failed to resolve import "../fleet-health-meter"`.

- [ ] **Step 3: Implement `FleetHealthMeter`**

Create `apps/web/components/fleet-health-meter.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import * as fleetApi from "@/components/fleet/api";
import { computeFleetHealth } from "@/lib/fleet-health";

const REFRESH_INTERVAL_MS = 30000;
const BAR_SEGMENTS = 8;

function toneColor(avg: number): string {
  if (avg >= 80) return "#34d399";
  if (avg >= 50) return "#fbbf24";
  return "#fca5a5";
}

/**
 * Sidebar-footer fleet-health summary. Fetches vehicles independently on a
 * slow interval — same "own client-side fetch in the sidebar" pattern
 * FleetSwitcher already uses in the header — since this is footer chrome
 * rendered from the async, session-only root layout, not a page's primary
 * data that would be threaded through props.
 */
export function FleetHealthMeter() {
  const [avg, setAvg] = useState<number | null>(null);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const vehicles = await fleetApi.listVehicles();
        if (cancelled) return;
        const health = computeFleetHealth(vehicles);
        setAvg(health.avg);
        setNeedsAttentionCount(health.needsAttentionCount);
      } catch {
        // Footer chrome — a failed fetch just leaves the meter hidden rather than surfacing an error.
      }
    }
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (avg === null) return null;

  const filledSegments = Math.round((avg / 100) * BAR_SEGMENTS);

  return (
    <div className="space-y-1" data-testid="fleet-health-meter">
      <div style={{ display: "flex", gap: "2px" }} aria-hidden="true">
        {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
          <span
            key={i}
            style={{
              width: "6px",
              height: "10px",
              borderRadius: "1px",
              background: i < filledSegments ? toneColor(avg) : "var(--border)",
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Fleet health {avg}%
        {needsAttentionCount > 0 &&
          ` · ${needsAttentionCount} vehicle${needsAttentionCount === 1 ? "" : "s"} need${needsAttentionCount === 1 ? "s" : ""} attention`}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the sidebar footer**

In `apps/web/app/layout.tsx`, find:
```tsx
import { SidebarNav } from "@/components/sidebar-nav";
```
Replace with:
```tsx
import { SidebarNav } from "@/components/sidebar-nav";
import { FleetHealthMeter } from "@/components/fleet-health-meter";
```
Find:
```tsx
            <div className="p-4 border-t border-border mt-auto bg-muted/30 space-y-3">
              <ThemeToggle />
              {session ? (
```
Replace with:
```tsx
            <div className="p-4 border-t border-border mt-auto bg-muted/30 space-y-3">
              <ThemeToggle />
              {session && <FleetHealthMeter />}
              {session ? (
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test -- fleet-health-meter.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/fleet-health-meter.tsx apps/web/app/layout.tsx apps/web/components/__tests__/fleet-health-meter.test.tsx
git commit -m "feat(web): add fleet-health meter to the sidebar footer"
```

---

### Task 9: Sidebar grouping and the new Overview nav entry

**Files:**
- Modify: `apps/web/components/sidebar-nav.tsx`
- Test: Create `apps/web/components/__tests__/sidebar-nav.test.tsx` (no test file exists for this component today)

**Interfaces:**
- No change to `SidebarNav`'s public shape (still a no-props component). Behavior change only: grouped rendering, new `/` entry, "Board"→"Tasks" and "Hub"→"Documents" labels.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/__tests__/sidebar-nav.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "../sidebar-nav";

expect.extend(jestDomMatchers);

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

describe("SidebarNav", () => {
  afterEach(() => cleanup());

  it("renders grouped headings and renamed labels", () => {
    usePathnameMock.mockReturnValue("/fleet");
    render(<SidebarNav />);
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("Fleet")).toBeDefined();
    expect(screen.getByText("Workspace")).toBeDefined();
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Tasks")).toBeDefined();
    expect(screen.getByText("Documents")).toBeDefined();
    expect(screen.queryByText("Board")).toBeNull();
    expect(screen.queryByText("Hub")).toBeNull();
  });

  it("marks only the Overview link active on the root path", () => {
    usePathnameMock.mockReturnValue("/");
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Map/ }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the Tasks link active on /board and its sub-paths", () => {
    usePathnameMock.mockReturnValue("/board/123");
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Tasks/ }).getAttribute("aria-current")).toBe("page");
  });

  it("the Tasks link still points at the unchanged /board route", () => {
    usePathnameMock.mockReturnValue("/fleet");
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Tasks/ }).getAttribute("href")).toBe("/board");
  });

  it("the Documents link still points at the unchanged /hub route", () => {
    usePathnameMock.mockReturnValue("/fleet");
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Documents/ }).getAttribute("href")).toBe("/hub");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- sidebar-nav.test.tsx`
Expected: FAIL — `screen.getByText("Operations")` finds nothing (current component has no groups).

- [ ] **Step 3: Implement the grouped sidebar**

Replace the full contents of `apps/web/components/sidebar-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, MessageSquare, ClipboardList, Files, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: typeof Truck;
}

interface NavGroup {
  heading: string;
  links: NavLink[];
}

/**
 * Grouped sidebar IA (suggestions.md §3). "Board"/"Hub" are relabeled to
 * "Tasks"/"Documents" — the routes underneath (`/board`, `/hub`) are
 * unchanged; a full route rename would touch every Link/test/gateway-proxy
 * path mapping for no functional gain.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Operations",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/map", label: "Map", icon: Globe },
    ],
  },
  {
    heading: "Fleet",
    links: [{ href: "/fleet", label: "Fleet", icon: Truck }],
  },
  {
    heading: "Workspace",
    links: [
      { href: "/board", label: "Tasks", icon: ClipboardList },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/hub", label: "Documents", icon: Files },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-6 px-4 flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <span
            className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {group.heading}
          </span>
          {group.links.map((link) => {
            const Icon = link.icon;
            // "/" needs an exact match (a prefix match would mark it active on every route); every other link keeps the prefix match so nested routes (e.g. /board/123) still highlight their parent.
            const active =
              link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- sidebar-nav.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/sidebar-nav.tsx apps/web/components/__tests__/sidebar-nav.test.tsx
git commit -m "feat(web): group sidebar into Operations/Fleet/Workspace, add Overview entry"
```

---

### Task 10: Breadcrumb on the vehicle detail page

**Files:**
- Modify: `apps/web/app/fleet/vehicles/[id]/page.tsx`
- Modify: `apps/web/app/fleet/vehicles/__tests__/page.test.tsx` (existing file — add one assertion)

**Interfaces:**
- Consumes: `Breadcrumb` from `@gamopls/ui` (Task 4).

- [ ] **Step 1: Extend the existing failing assertion**

In `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`, in the first test (`"loads and displays the vehicle's details and current assignment"`), find:
```tsx
    await waitFor(() => expect(screen.getByText("TN-01-AB-1234 (van)")).toBeInTheDocument());
    expect(screen.getByText(/12,000 km/)).toBeInTheDocument();
```
Replace with:
```tsx
    await waitFor(() => expect(screen.getByText("TN-01-AB-1234 (van)")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Fleet" })).toHaveAttribute("href", "/fleet");
    expect(screen.getByText(/12,000 km/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- apps/web/app/fleet/vehicles/__tests__/page.test.tsx`
Expected: FAIL — no element with role `link` named "Fleet" exists yet.

- [ ] **Step 3: Add the breadcrumb**

In `apps/web/app/fleet/vehicles/[id]/page.tsx`, find:
```tsx
import { Card, Spinner, Button } from "@gamopls/ui";
```
Replace with:
```tsx
import { Breadcrumb, Card, Spinner, Button } from "@gamopls/ui";
```
Find:
```tsx
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>
```
Replace with:
```tsx
      <div>
        <Breadcrumb segments={[{ label: "Fleet", href: "/fleet" }, { label: asset.display_label }]} />
        <h1 className="text-2xl font-bold text-foreground tracking-tight mt-2">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- apps/web/app/fleet/vehicles/__tests__/page.test.tsx`
Expected: PASS (all 3 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/fleet/vehicles/[id]/page.tsx apps/web/app/fleet/vehicles/__tests__/page.test.tsx
git commit -m "feat(web): breadcrumb on the vehicle detail page"
```

---

### Task 11: `EventsFeed` presentational component

**Files:**
- Create: `apps/web/components/overview/EventsFeed.tsx`
- Test: `apps/web/components/overview/__tests__/EventsFeed.test.tsx`

**Interfaces:**
- Consumes: `StatusChip` from `@gamopls/ui` (Task 2), `FeedEvent` type from `@/lib/events-feed` (Task 6).
- Produces: `EventsFeed({ events: FeedEvent[] })`. Used by Task 13 (OverviewDashboard).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/overview/__tests__/EventsFeed.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventsFeed } from "../EventsFeed";
import type { FeedEvent } from "@/lib/events-feed";

expect.extend(jestDomMatchers);

describe("EventsFeed", () => {
  afterEach(() => cleanup());

  it("shows the empty state when there are no events", () => {
    render(<EventsFeed events={[]} />);
    expect(screen.getByText("No recent activity.")).toBeDefined();
  });

  it("renders each event's message and chip label", () => {
    const events: FeedEvent[] = [
      { id: "1", timestamp: new Date().toISOString(), message: "Battery below 10%", chipLabel: "Critical", tone: "danger" },
      { id: "2", timestamp: new Date().toISOString(), message: "oil_change due", chipLabel: "Suggested", tone: "info" },
    ];
    render(<EventsFeed events={events} />);
    expect(screen.getByText("Battery below 10%")).toBeDefined();
    expect(screen.getByText("Critical").getAttribute("data-tone")).toBe("danger");
    expect(screen.getByText("oil_change due")).toBeDefined();
    expect(screen.getByText("Suggested").getAttribute("data-tone")).toBe("info");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- EventsFeed.test.tsx`
Expected: FAIL — `Failed to resolve import "../EventsFeed"`.

- [ ] **Step 3: Implement `EventsFeed`**

Create `apps/web/components/overview/EventsFeed.tsx`:
```tsx
"use client";

import { StatusChip } from "@gamopls/ui";
import type { FeedEvent } from "@/lib/events-feed";

export interface EventsFeedProps {
  events: FeedEvent[];
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function EventsFeed({ events }: EventsFeedProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No recent activity.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
              {relativeTime(event.timestamp)}
            </p>
            <p className="text-sm text-foreground truncate">{event.message}</p>
          </div>
          <StatusChip tone={event.tone}>{event.chipLabel}</StatusChip>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- EventsFeed.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/overview/EventsFeed.tsx apps/web/components/overview/__tests__/EventsFeed.test.tsx
git commit -m "feat(web): add EventsFeed presentational component"
```

---

### Task 12: `OverviewKpiRow` presentational component

**Files:**
- Create: `apps/web/components/overview/OverviewKpiRow.tsx`
- Test: `apps/web/components/overview/__tests__/OverviewKpiRow.test.tsx`

**Interfaces:**
- Consumes: `KpiTile` from `@gamopls/ui` (Task 3).
- Produces: `OverviewKpiRow({ vehiclesOnline, vehiclesTotal, avgHealth, activeAlerts24h, avgMileageKmpl })`. Used by Task 13 (OverviewDashboard).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/overview/__tests__/OverviewKpiRow.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverviewKpiRow } from "../OverviewKpiRow";

expect.extend(jestDomMatchers);

describe("OverviewKpiRow", () => {
  afterEach(() => cleanup());

  it("renders all four KPI values", () => {
    render(
      <OverviewKpiRow vehiclesOnline={3} vehiclesTotal={5} avgHealth={87} activeAlerts24h={2} avgMileageKmpl={14.2} />,
    );
    expect(screen.getByText("Vehicles online")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("/ 5")).toBeDefined();
    expect(screen.getByText("87")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("14.2")).toBeDefined();
  });

  it("shows a dash for avg health and avg mileage when there is no data", () => {
    render(
      <OverviewKpiRow vehiclesOnline={0} vehiclesTotal={0} avgHealth={null} activeAlerts24h={0} avgMileageKmpl={null} />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- OverviewKpiRow.test.tsx`
Expected: FAIL — `Failed to resolve import "../OverviewKpiRow"`.

- [ ] **Step 3: Implement `OverviewKpiRow`**

Create `apps/web/components/overview/OverviewKpiRow.tsx`:
```tsx
"use client";

import { KpiTile } from "@gamopls/ui";
import { Car, HeartPulse, TriangleAlert, Fuel } from "lucide-react";

export interface OverviewKpiRowProps {
  vehiclesOnline: number;
  vehiclesTotal: number;
  avgHealth: number | null;
  activeAlerts24h: number;
  avgMileageKmpl: number | null;
}

export function OverviewKpiRow({
  vehiclesOnline,
  vehiclesTotal,
  avgHealth,
  activeAlerts24h,
  avgMileageKmpl,
}: OverviewKpiRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiTile icon={<Car className="h-4 w-4" />} label="Vehicles online" value={String(vehiclesOnline)} unit={`/ ${vehiclesTotal}`} />
      <KpiTile
        icon={<HeartPulse className="h-4 w-4" />}
        label="Avg fleet health"
        value={avgHealth === null ? "—" : String(avgHealth)}
        unit={avgHealth === null ? undefined : "%"}
      />
      <KpiTile icon={<TriangleAlert className="h-4 w-4" />} label="Active alerts (24h)" value={String(activeAlerts24h)} />
      <KpiTile
        icon={<Fuel className="h-4 w-4" />}
        label="Avg mileage"
        value={avgMileageKmpl === null ? "—" : avgMileageKmpl.toFixed(1)}
        unit={avgMileageKmpl === null ? undefined : "km/L"}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- OverviewKpiRow.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/overview/OverviewKpiRow.tsx apps/web/components/overview/__tests__/OverviewKpiRow.test.tsx
git commit -m "feat(web): add OverviewKpiRow presentational component"
```

---

### Task 13: `OverviewDashboard` (data fetching + composition)

**Files:**
- Create: `apps/web/components/overview/OverviewDashboard.tsx`
- Test: `apps/web/components/overview/__tests__/OverviewDashboard.test.tsx`

**Interfaces:**
- Consumes: `fleetApi.listVehicles()`, `boardApi.listTasks()`, `chatApi.fetchChannels()`/`fetchMessages()` (all already exist), `computeFleetHealth` (Task 5), `filterAlertMessages`/`mergeEvents` (Task 6), `VehiclesTable` (Task 7, reused as-is), `OverviewKpiRow` (Task 12), `EventsFeed` (Task 11), `Spinner` from `@gamopls/ui`.
- Produces: `OverviewDashboard({ fleetId: string })`. Rendered by Task 14 (`apps/web/app/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/overview/__tests__/OverviewDashboard.test.tsx`:
```tsx
// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverviewDashboard } from "../OverviewDashboard";
import * as fleetApi from "@/components/fleet/api";
import * as boardApi from "@/components/board/api";
import * as chatApi from "@/components/chat/api";
import type { Asset } from "@/components/fleet/types";

expect.extend(jestDomMatchers);
vi.mock("@/components/fleet/api");
vi.mock("@/components/board/api");
vi.mock("@/components/chat/api");

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: "TN-01",
    health_score: 90,
    telemetry: {},
    telemetry_updated_at: new Date().toISOString(),
    last_mileage_kmpl: 15,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("OverviewDashboard", () => {
  afterEach(() => cleanup());

  it("shows the collapsed get-started prompt when there are zero vehicles and zero events", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(boardApi.listTasks).mockResolvedValue([]);
    vi.mocked(chatApi.fetchChannels).mockResolvedValue([]);

    render(<OverviewDashboard fleetId="fleet-1" />);

    expect(await screen.findByText("Get started")).toBeInTheDocument();
  });

  it("renders KPIs and the vehicles table once vehicles load", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([makeAsset()]);
    vi.mocked(boardApi.listTasks).mockResolvedValue([]);
    vi.mocked(chatApi.fetchChannels).mockResolvedValue([]);

    render(<OverviewDashboard fleetId="fleet-1" />);

    await waitFor(() => expect(screen.getByText("Vehicles online")).toBeInTheDocument());
    expect(screen.getByText("TN-01")).toBeInTheDocument();
  });

  it("fetches messages only from the earliest channel belonging to the current fleet", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([makeAsset()]);
    vi.mocked(boardApi.listTasks).mockResolvedValue([]);
    vi.mocked(chatApi.fetchChannels).mockResolvedValue([
      { id: "ch-other-fleet", org_id: "org-1", fleet_id: "fleet-2", mission_id: "m", name: "x", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "ch-later", org_id: "org-1", fleet_id: "fleet-1", mission_id: "m", name: "later", createdAt: "2026-02-01T00:00:00.000Z" },
      { id: "ch-earliest", org_id: "org-1", fleet_id: "fleet-1", mission_id: "m", name: "earliest", createdAt: "2026-01-15T00:00:00.000Z" },
    ]);
    vi.mocked(chatApi.fetchMessages).mockResolvedValue([]);

    render(<OverviewDashboard fleetId="fleet-1" />);

    await waitFor(() => expect(chatApi.fetchMessages).toHaveBeenCalledWith("ch-earliest"));
    expect(chatApi.fetchMessages).not.toHaveBeenCalledWith("ch-later");
    expect(chatApi.fetchMessages).not.toHaveBeenCalledWith("ch-other-fleet");
  });

  it("merges suggested tasks and alert messages into the recent-activity feed, excluding non-draft tasks", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([makeAsset()]);
    vi.mocked(boardApi.listTasks).mockResolvedValue([
      {
        id: "task-1", org_id: "org-1", fleet_id: "fleet-1", mission_id: null,
        title: "oil_change due for asset asset-1", description: "", status: "draft",
        asset_id: "asset-1", created_at: "2026-07-12T09:00:00.000Z", updated_at: "2026-07-12T09:00:00.000Z",
      },
      {
        id: "task-2", org_id: "org-1", fleet_id: "fleet-1", mission_id: "m1",
        title: "manually created", description: "", status: "open",
        asset_id: null, created_at: "2026-07-12T09:30:00.000Z", updated_at: "2026-07-12T09:30:00.000Z",
      },
    ]);
    vi.mocked(chatApi.fetchChannels).mockResolvedValue([
      { id: "ch-1", org_id: "org-1", fleet_id: "fleet-1", mission_id: "m", name: "Fleet Alerts", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    vi.mocked(chatApi.fetchMessages).mockResolvedValue([
      {
        id: "msg-1", channelId: "ch-1", org_id: "org-1", fleet_id: "fleet-1",
        senderType: "system", senderId: "system:alert-bridge", body: "[CRITICAL] Battery below 10%",
        createdAt: "2026-07-12T10:00:00.000Z",
      },
    ]);

    render(<OverviewDashboard fleetId="fleet-1" />);

    expect(await screen.findByText("Battery below 10%")).toBeInTheDocument();
    expect(screen.getByText("oil_change due for asset asset-1")).toBeInTheDocument();
    expect(screen.queryByText("manually created")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- OverviewDashboard.test.tsx`
Expected: FAIL — `Failed to resolve import "../OverviewDashboard"`.

- [ ] **Step 3: Implement `OverviewDashboard`**

Create `apps/web/components/overview/OverviewDashboard.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@gamopls/ui";
import * as fleetApi from "@/components/fleet/api";
import * as boardApi from "@/components/board/api";
import * as chatApi from "@/components/chat/api";
import type { Asset } from "@/components/fleet/types";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";
import { computeFleetHealth } from "@/lib/fleet-health";
import { filterAlertMessages, mergeEvents } from "@/lib/events-feed";
import { VehiclesTable } from "@/components/fleet/VehiclesTable";
import { OverviewKpiRow } from "./OverviewKpiRow";
import { EventsFeed } from "./EventsFeed";

const POLL_INTERVAL_MS = 15000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OverviewDashboardProps {
  fleetId: string;
}

function countOnline(vehicles: Asset[]): number {
  const now = Date.now();
  return vehicles.filter((v) => v.telemetry_updated_at !== null && now - new Date(v.telemetry_updated_at).getTime() < ONLINE_THRESHOLD_MS)
    .length;
}

function avgMileage(vehicles: Asset[]): number | null {
  const values = vehicles.map((v) => v.last_mileage_kmpl).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Composes three already-existing gateway clients into one dashboard: no
 * backend changes anywhere in this component. Alerts are sourced from the
 * *earliest*-created channel belonging to the current fleet, mirroring
 * services/chat/src/alert-bridge.ts's own channel-resolution rule exactly
 * (it always posts to that same channel) — this is not a heuristic, it's a
 * client-side replica of a server-side invariant.
 */
export function OverviewDashboard({ fleetId }: OverviewDashboardProps) {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alertMessages, setAlertMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [vehiclesData, tasksData, channels] = await Promise.all([
        fleetApi.listVehicles(),
        boardApi.listTasks(),
        chatApi.fetchChannels(),
      ]);
      setVehicles(vehiclesData);
      setTasks(tasksData.filter((t) => t.status === "draft"));

      const fleetChannels = channels
        .filter((c) => c.fleet_id === fleetId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const alertChannel = fleetChannels[0];
      if (alertChannel) {
        const messages = await chatApi.fetchMessages(alertChannel.id);
        setAlertMessages(filterAlertMessages(messages));
      } else {
        setAlertMessages([]);
      }
    } catch {
      // Glance dashboard, not any page's source of truth — a failed poll
      // leaves the last-known data on screen instead of showing an error.
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [fleetId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading overview" />
      </div>
    );
  }

  const health = computeFleetHealth(vehicles);
  const activeAlerts24h = alertMessages.filter((m) => Date.now() - new Date(m.createdAt).getTime() < ALERT_WINDOW_MS).length;
  const events = mergeEvents(tasks, alertMessages);
  const isEmpty = vehicles.length === 0 && events.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-24 space-y-3">
        <p className="text-lg font-semibold text-foreground">Get started</p>
        <p className="text-sm text-muted-foreground">Add your first vehicle to start seeing fleet data here.</p>
        <Link
          href="/fleet"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Add vehicle
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverviewKpiRow
        vehiclesOnline={countOnline(vehicles)}
        vehiclesTotal={vehicles.length}
        avgHealth={health.avg}
        activeAlerts24h={activeAlerts24h}
        avgMileageKmpl={avgMileage(vehicles)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Vehicles</h2>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
              No vehicles yet — <Link href="/fleet" className="text-primary hover:underline">add one</Link>.
            </p>
          ) : (
            <VehiclesTable vehicles={vehicles} />
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
          <EventsFeed events={events} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- OverviewDashboard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/overview/OverviewDashboard.tsx apps/web/components/overview/__tests__/OverviewDashboard.test.tsx
git commit -m "feat(web): add OverviewDashboard — KPIs, vehicles table, merged activity feed"
```

---

### Task 14: Wire the Overview dashboard into `apps/web/app/page.tsx`

**Files:**
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `OverviewDashboard` (Task 13), `getSession()` from `@/lib/session` (already exists — returns `null` for logged-out visitors, `VerifiedGamoplsJwtClaims` with a `fleet_id` field otherwise).

No unit test for this file: it's an async Server Component using `next/headers`'s `cookies()` (via `getSession()`), and this codebase has no precedent for directly unit-testing that class of file — `apps/web/app/layout.tsx` (the other file using `getSession()`) isn't unit-tested either. `OverviewDashboard`'s own tests (Task 13) already cover the logged-in rendering logic; this task is verified by a production build plus the manual browser check in Task 15.

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `apps/web/app/page.tsx`:
```tsx
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Globe, ClipboardList, MessageSquare, Files, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverviewDashboard } from "@/components/overview/OverviewDashboard";

const MODULES = [
  {
    title: "Geospatial Tracking",
    href: "/map",
    desc: "Live asset tracking, real-time telemetry streaming, and dynamic geofencing exit monitoring.",
    icon: Globe,
    colorClass: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
    badgeText: "Real-time"
  },
  {
    title: "Operations Board",
    href: "/board",
    desc: "Mission planning, task workflow management, and autonomous AI health scoring triage.",
    icon: ClipboardList,
    colorClass: "text-blue-400 border-blue-500/20 bg-blue-500/5",
    badgeText: "AI Engine"
  },
  {
    title: "Tactical Messaging",
    href: "/chat",
    desc: "Instant dispatcher communications, group channels, and automated event log streaming.",
    icon: MessageSquare,
    colorClass: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    badgeText: "Secure"
  },
  {
    title: "Fleet Knowledge Hub",
    href: "/hub",
    desc: "Document metadata catalogs, keyword searching, and indexed technical schematics.",
    icon: Files,
    colorClass: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    badgeText: "Knowledge"
  }
];

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    return <OverviewDashboard fleetId={session.fleet_id} />;
  }

  return (
    <div className="space-y-12">
      {/* Hero Welcome Banner — public landing only; logged-in users see OverviewDashboard above */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card/50 p-8 md:p-12 shadow-2xl backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-30 pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active Fleet Operation Shield
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Human-Machine Fleet <br className="hidden md:inline" />
            Control Cockpit
          </h1>

          <p className="text-base md:text-lg text-muted-foreground max-w-2xl font-medium">
            GAMOPLS TeamCore provides real-time telemetry processing, mission task allocation, channel communications, and predictive model scoring for pilot edge boxes.
          </p>

          <div className="pt-2">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity">
              Authenticate Fleet Access
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Grid Modules */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Operational Modules</h2>
          <p className="text-sm text-muted-foreground mt-1">Select an index below to manage telemetry and task workflows.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group block">
                <Card className="h-full border border-border bg-card/30 hover:bg-card/80 hover:border-muted-foreground/30 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1">
                  <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-lg border ${mod.colorClass}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {mod.badgeText}
                      </span>
                    </div>
                    <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {mod.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
                      {mod.desc}
                    </CardDescription>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mt-6 opacity-80 group-hover:opacity-100 transition-opacity">
                      Open Module
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm --filter web build`
Expected: build succeeds. (This is also where a mismatch between `session.fleet_id`'s type and `OverviewDashboardProps` would surface as a TypeScript error.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): logged-in users land on the Overview dashboard instead of the marketing hero (suggestions.md NEXT-9)"
```

---

### Task 15: Whole-branch verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full workspace verification suite**

```bash
pnpm build && pnpm lint && pnpm test && node scripts/check-architecture-rules.mjs
```
Expected: all green. (`check-architecture-rules.mjs` should show the same pre-existing 3 heuristic warnings noted before this plan started — `services/fleet/src/build-app.ts:164`, two in `services/map` — and no new ones; this plan didn't touch asset-type branching.)

- [ ] **Step 2: Manual browser check**

Run: `cd apps/web && pnpm build && pnpm start` (production mode — this repo's `next dev` has a known EMFILE watcher issue; use build+start for smoke testing, per this project's established workaround).

In a browser:
1. Visit `/` logged out — confirm the marketing hero still renders exactly as before.
2. Log in — confirm `/` now shows the Overview dashboard: KPI row, vehicles table (or the "Get started" prompt if the demo org has zero vehicles), recent-activity panel.
3. Confirm the whole app reads noticeably darker/flatter than before (background near-black, cards barely lifted off it) and that text/buttons/inputs are still comfortably legible — this is the one thing no automated test in this plan verifies.
4. Confirm the sidebar shows three grouped sections (Operations/Fleet/Workspace), "Tasks" and "Documents" labels (not "Board"/"Hub"), and that clicking them still lands on `/board`/`/hub`.
5. Confirm the sidebar footer shows the fleet-health meter (small bar + "Fleet health N%" text) below the theme toggle.
6. Open a vehicle's detail page — confirm the "Fleet / <vehicle label>" breadcrumb renders above the heading and the "Fleet" segment links back to `/fleet`.
7. Confirm KPI values and table numerals visually use the monospace font (distinct letterforms from the surrounding sans-serif text).

- [ ] **Step 3: Stop the server**

```bash
# Ctrl-C the `pnpm start` process, or:
lsof -ti :3000 | xargs -r kill
```

- [ ] **Step 4: No commit for this task** — it produced no file changes, only verification. If Step 2 surfaces a real visual problem, fix it as a small follow-up commit before considering this plan complete.
