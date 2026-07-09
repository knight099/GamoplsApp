# Digital Twin Vehicle Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "Health {score}" badge on the vehicle detail page with an SVG vehicle silhouette showing four colored hotspots (Engine, Battery, Fuel, Overall), each driven by its own telemetry reading and thresholds, gracefully showing "No data" for missing readings.

**Architecture:** Frontend-only (`apps/web`), two files: a new pure-logic-plus-SVG `VehicleDigitalTwin` component, and a small edit to the existing `app/fleet/vehicles/[id]/page.tsx` to use it in place of the current health badge.

**Tech Stack:** Plain SVG (no charting/diagram library), existing `@gamopls/ui` `Badge`, matches this codebase's existing `healthTone()`-style pattern.

## Global Constraints

- No backend/telemetry changes — this visualizes `Asset.telemetry`/`health_score`, both already returned by `GET /api/fleet/assets/:id`.
- A hotspot with no matching telemetry key renders neutral/"No data" — never invent a value.
- Everything else on the vehicle detail page (plate/type/odometer, driver assignment) is unchanged.

---

### Task 1: `VehicleDigitalTwin` component

**Files:**
- Create: `apps/web/components/fleet/VehicleDigitalTwin.tsx`
- Test: `apps/web/components/fleet/__tests__/VehicleDigitalTwin.test.tsx`

**Interfaces:**
- Produces: `computeHotspots(telemetry: Record<string, unknown>, healthScore: number): Hotspot[]` (exported for direct unit testing) and `<VehicleDigitalTwin telemetry={...} healthScore={...} />`. Task 2 imports and renders this component on the vehicle detail page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/fleet/__tests__/VehicleDigitalTwin.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VehicleDigitalTwin, computeHotspots } from "../VehicleDigitalTwin";

afterEach(() => cleanup());

describe("computeHotspots", () => {
  it("computes tone per hotspot from its own reading, not the aggregate score", () => {
    const hotspots = computeHotspots(
      { engine_temp_c: 120, battery_pct: 80, fuel_pct: 5 },
      95, // high overall score, but engine and fuel should independently be danger
    );
    const engine = hotspots.find((h) => h.key === "engine")!;
    const battery = hotspots.find((h) => h.key === "battery")!;
    const fuel = hotspots.find((h) => h.key === "fuel")!;
    const overall = hotspots.find((h) => h.key === "overall")!;

    expect(engine.tone).toBe("danger");
    expect(battery.tone).toBe("success");
    expect(fuel.tone).toBe("danger");
    expect(overall.tone).toBe("success");
  });

  it("marks a hotspot as neutral/no-data when its telemetry key is missing", () => {
    const hotspots = computeHotspots({ engine_temp_c: 90 }, 100);
    const battery = hotspots.find((h) => h.key === "battery")!;
    expect(battery.tone).toBe("neutral");
    expect(battery.value).toBeNull();
  });

  it("overall hotspot is always present using healthScore", () => {
    const hotspots = computeHotspots({}, 42);
    const overall = hotspots.find((h) => h.key === "overall")!;
    expect(overall.value).toBe(42);
    expect(overall.tone).toBe("danger");
  });
});

describe("VehicleDigitalTwin", () => {
  it("renders all four hotspot labels and shows detail on click", () => {
    render(<VehicleDigitalTwin telemetry={{ engine_temp_c: 91, battery_pct: 76, fuel_pct: 54 }} healthScore={88} />);

    expect(screen.getByText(/Engine/)).toBeInTheDocument();
    expect(screen.getByText(/Battery/)).toBeInTheDocument();
    expect(screen.getByText(/Fuel/)).toBeInTheDocument();
    expect(screen.getByText(/Overall/)).toBeInTheDocument();

    const engineHotspot = screen.getByTestId("hotspot-engine");
    fireEvent.click(engineHotspot);
    expect(screen.getByText("Engine: 91°C")).toBeInTheDocument();
  });

  it("shows 'No data' for a hotspot with no matching telemetry", () => {
    render(<VehicleDigitalTwin telemetry={{}} healthScore={100} />);
    fireEvent.click(screen.getByTestId("hotspot-battery"));
    expect(screen.getByText("Battery: No data")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/VehicleDigitalTwin.test.tsx`
Expected: FAIL — `Cannot find module '../VehicleDigitalTwin'`.

- [ ] **Step 3: Write `VehicleDigitalTwin.tsx`**

Create `apps/web/components/fleet/VehicleDigitalTwin.tsx`:

```typescript
"use client";

import { useState } from "react";

export type HotspotTone = "success" | "warning" | "danger" | "neutral";

export interface Hotspot {
  key: "engine" | "battery" | "fuel" | "overall";
  label: string;
  cx: number;
  cy: number;
  value: number | null;
  unit: string;
  tone: HotspotTone;
}

const TONE_COLORS: Record<HotspotTone, string> = {
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  neutral: "#6b7280",
};

function toneFor(value: number | null, thresholds: { good: number; ok: number; higherIsBetter: boolean }): HotspotTone {
  if (value === null) return "neutral";
  const { good, ok, higherIsBetter } = thresholds;
  if (higherIsBetter) {
    if (value >= good) return "success";
    if (value >= ok) return "warning";
    return "danger";
  }
  if (value <= good) return "success";
  if (value <= ok) return "warning";
  return "danger";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function computeHotspots(telemetry: Record<string, unknown>, healthScore: number): Hotspot[] {
  const engineTemp = numberOrNull(telemetry.engine_temp_c);
  const batteryPct = numberOrNull(telemetry.battery_pct);
  const fuelPct = numberOrNull(telemetry.fuel_pct);

  return [
    {
      key: "engine",
      label: "Engine",
      cx: 90,
      cy: 55,
      value: engineTemp,
      unit: "°C",
      tone: toneFor(engineTemp, { good: 95, ok: 110, higherIsBetter: false }),
    },
    {
      key: "battery",
      label: "Battery",
      cx: 60,
      cy: 45,
      value: batteryPct,
      unit: "%",
      tone: toneFor(batteryPct, { good: 50, ok: 25, higherIsBetter: true }),
    },
    {
      key: "fuel",
      label: "Fuel",
      cx: 180,
      cy: 55,
      value: fuelPct,
      unit: "%",
      tone: toneFor(fuelPct, { good: 30, ok: 10, higherIsBetter: true }),
    },
    {
      key: "overall",
      label: "Overall",
      cx: 150,
      cy: 25,
      value: healthScore,
      unit: "",
      tone: toneFor(healthScore, { good: 80, ok: 50, higherIsBetter: true }),
    },
  ];
}

export interface VehicleDigitalTwinProps {
  telemetry: Record<string, unknown>;
  healthScore: number;
}

export function VehicleDigitalTwin({ telemetry, healthScore }: VehicleDigitalTwinProps) {
  const hotspots = computeHotspots(telemetry, healthScore);
  const [selected, setSelected] = useState<Hotspot | null>(null);

  function formatValue(h: Hotspot): string {
    return h.value === null ? "No data" : `${h.value}${h.unit}`;
  }

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 300 120" className="w-full max-w-md" role="img" aria-label="Vehicle digital twin">
        {/* Simple generic vehicle silhouette — same outline regardless of vehicle type */}
        <rect x="20" y="40" width="220" height="35" rx="10" fill="#27272a" stroke="#3f3f46" />
        <path d="M50 40 L80 15 L200 15 L230 40 Z" fill="#27272a" stroke="#3f3f46" />
        <circle cx="70" cy="80" r="14" fill="#18181b" stroke="#3f3f46" />
        <circle cx="210" cy="80" r="14" fill="#18181b" stroke="#3f3f46" />

        {hotspots.map((h) => (
          <circle
            key={h.key}
            data-testid={`hotspot-${h.key}`}
            cx={h.cx}
            cy={h.cy}
            r={9}
            fill={TONE_COLORS[h.tone]}
            stroke="white"
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onClick={() => setSelected(h)}
          >
            <title>{`${h.label}: ${formatValue(h)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="flex flex-wrap gap-2">
        {hotspots.map((h) => (
          <button
            key={h.key}
            type="button"
            data-testid={`legend-${h.key}`}
            onClick={() => setSelected(h)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span
              style={{ width: 8, height: 8, borderRadius: "50%", background: TONE_COLORS[h.tone], display: "inline-block" }}
            />
            {h.label}
          </button>
        ))}
      </div>

      {selected && (
        <p className="text-sm text-foreground font-semibold">
          {selected.label}: {formatValue(selected)}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/VehicleDigitalTwin.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/fleet/VehicleDigitalTwin.tsx apps/web/components/fleet/__tests__/VehicleDigitalTwin.test.tsx
git commit -m "feat(web): add VehicleDigitalTwin component with per-hotspot health thresholds"
```

---

### Task 2: Wire the digital twin into the vehicle detail page

**Files:**
- Modify: `apps/web/app/fleet/vehicles/[id]/page.tsx`
- Modify: `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `VehicleDigitalTwin` (Task 1), `Asset.telemetry`/`Asset.health_score` (already on the `Asset` type from sub-project A).

- [ ] **Step 1: Extend the existing page test**

In `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`, add to the existing test's mocked `getVehicle` response (it already returns `health_score: 91, telemetry: { fuel_pct: 60 }` — extend `telemetry` to include `engine_temp_c: 91, battery_pct: 76`), and add this assertion at the end of the existing test body:

```typescript
    expect(screen.getByTestId("hotspot-engine")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/fleet/vehicles`
Expected: FAIL — no element with `data-testid="hotspot-engine"` on the page yet.

- [ ] **Step 3: Replace the health badge section with the digital twin**

In `apps/web/app/fleet/vehicles/[id]/page.tsx`, add the import:

```typescript
import { VehicleDigitalTwin } from "@/components/fleet/VehicleDigitalTwin";
```

Replace this block:

```typescript
      <Card className="border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Badge tone={healthTone(asset.health_score)}>Health {asset.health_score}</Badge>
          {typeof asset.telemetry.fuel_pct === "number" && (
            <span className="text-sm text-muted-foreground">Fuel: {asset.telemetry.fuel_pct}%</span>
          )}
        </div>
        {asset.vehicleDetails && (
```

with:

```typescript
      <Card className="border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Digital twin</h2>
        <VehicleDigitalTwin telemetry={asset.telemetry} healthScore={asset.health_score} />
        {asset.vehicleDetails && (
```

The `healthTone` helper function at the top of the file becomes unused after this change — remove it (its logic now lives inside `VehicleDigitalTwin.tsx`'s `toneFor`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/fleet/vehicles`
Expected: PASS, 1 test.

- [ ] **Step 5: Run the full `apps/web` test suite and typecheck**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors (confirms removing the unused `healthTone` didn't break anything else in the file).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/fleet/vehicles
git commit -m "feat(web): show the digital twin on the vehicle detail page"
```

---

## Post-plan verification

```bash
pnpm build && pnpm lint && pnpm test
```

Then smoke-test manually: open a vehicle's detail page from the map popup's "More details" link, confirm the four hotspots render with plausible colors, click each one and confirm the reading shown matches the vehicle's telemetry.
