# Interactive Map with Clickable Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat position table on the Map page with a real interactive Leaflet map — clickable markers showing a quick health/fuel/odometer overview, geofence circles, and a "more details" link into a per-vehicle stub page.

**Architecture:** Frontend-only (`apps/web`). A new `MapCanvas` client component wraps `react-leaflet`, loaded via `next/dynamic({ ssr: false })` since Leaflet needs `window`. `MapView` fetches `services/fleet`'s asset list (already built) alongside `services/map`'s positions (already existing) and joins them client-side by `id` before handing merged marker data to `MapCanvas`. No backend changes.

**Tech Stack:** `leaflet` + `react-leaflet` (v4, React 18-compatible), OpenStreetMap tiles (no API key), existing `@gamopls/ui`/Tailwind primitives, `next/dynamic`.

## Global Constraints

- No backend changes — `services/map` and `services/fleet` already expose everything needed.
- Marker icons stay generic (`divIcon`, colored by health tone) — never branch on asset type or `icon` string content, per `CLAUDE.md`.
- The existing `AssetPositionsTable` stays — the map is added above it, not a replacement.
- Every new component test mocks `react-leaflet` (it doesn't run in jsdom) — matches the standard pattern for testing Leaflet-based React components.

---

### Task 1: `MapCanvas` — Leaflet map with position markers and geofence circles

**Files:**
- Create: `apps/web/components/map/MapCanvas.tsx`
- Modify: `apps/web/package.json` (add `leaflet`, `react-leaflet`, `@types/leaflet`)
- Test: `apps/web/components/map/__tests__/MapCanvas.test.tsx`

**Interfaces:**
- Produces: `MapMarkerData` interface (`id, icon, label, lat, lng, heading?, speed?, positionUpdatedAt, healthScore?, fuelPct?, odometerKm?`), `<MapCanvas markers={MapMarkerData[]} geofences={Geofence[]} />`. Task 2 extends the marker popup content this renders; Task 4 wires it into `MapView`.

- [ ] **Step 1: Add dependencies**

Add to `apps/web/package.json`'s `dependencies`: `"leaflet": "^1.9.4"`, `"react-leaflet": "^4.2.1"`. Add to `devDependencies`: `"@types/leaflet": "^1.9.12"`.

Run: `pnpm install`
Expected: exits 0, `apps/web/node_modules/leaflet` and `react-leaflet` present.

- [ ] **Step 2: Write the failing test**

Create `apps/web/components/map/__tests__/MapCanvas.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapCanvas } from "../MapCanvas";
import type { MapMarkerData } from "../MapCanvas";
import type { Geofence } from "../types";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  Circle: (props: { center: [number, number]; radius: number }) => (
    <div data-testid="circle" data-center={JSON.stringify(props.center)} data-radius={props.radius} />
  ),
}));

const marker: MapMarkerData = {
  id: "asset-1",
  icon: "generic-asset-marker",
  label: "Truck 42",
  lat: 13.08,
  lng: 80.27,
  positionUpdatedAt: "2026-07-08T10:00:00.000Z",
};

const geofence: Geofence = {
  id: "geo-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  asset_id: "asset-1",
  name: "Depot",
  centerLat: 13.08,
  centerLng: 80.27,
  radiusMeters: 500,
  createdAt: "2026-07-08T10:00:00.000Z",
  updatedAt: "2026-07-08T10:00:00.000Z",
};

describe("MapCanvas", () => {
  it("renders a map container, one marker per position, and one circle per geofence", () => {
    render(<MapCanvas markers={[marker]} geofences={[geofence]} />);

    expect(screen.getByTestId("map-container")).toBeInTheDocument();
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
    expect(screen.getByText("Truck 42")).toBeInTheDocument();
    const circle = screen.getByTestId("circle");
    expect(circle.dataset.radius).toBe("500");
    expect(JSON.parse(circle.dataset.center!)).toEqual([13.08, 80.27]);
  });

  it("renders nothing extra when there are no markers or geofences", () => {
    render(<MapCanvas markers={[]} geofences={[]} />);
    expect(screen.queryByTestId("marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("circle")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapCanvas.test.tsx`
Expected: FAIL — `Cannot find module '../MapCanvas'`.

- [ ] **Step 4: Write `MapCanvas.tsx`**

Create `apps/web/components/map/MapCanvas.tsx`:

```typescript
"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Geofence } from "./types";

export interface MapMarkerData {
  id: string;
  icon: string;
  label: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;
  healthScore?: number;
  fuelPct?: number | null;
  odometerKm?: number | null;
}

export interface MapCanvasProps {
  markers: MapMarkerData[];
  geofences: Geofence[];
}

function healthTone(score: number | undefined): "success" | "warning" | "danger" | "neutral" {
  if (score === undefined) return "neutral";
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

const TONE_COLORS: Record<ReturnType<typeof healthTone>, string> = {
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  neutral: "#9ca3af",
};

function markerIcon(score: number | undefined): L.DivIcon {
  const color = TONE_COLORS[healthTone(score)];
  return L.divIcon({
    className: "gamopls-map-marker",
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707]; // Chennai — matches the pilot fleet's home region

export function MapCanvas({ markers, geofences }: MapCanvasProps) {
  const center: [number, number] = markers.length > 0 ? [markers[0].lat, markers[0].lng] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={12} style={{ height: "480px", width: "100%", borderRadius: "0.75rem" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {markers.map((marker) => (
        <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={markerIcon(marker.healthScore)}>
          <Popup>{marker.label}</Popup>
        </Marker>
      ))}
      {geofences.map((geofence) => (
        <Circle
          key={geofence.id}
          center={[geofence.centerLat, geofence.centerLng]}
          radius={geofence.radiusMeters}
          pathOptions={{ color: "#22d3ee", fillOpacity: 0.1 }}
        />
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapCanvas.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/map/MapCanvas.tsx apps/web/components/map/__tests__/MapCanvas.test.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add MapCanvas — Leaflet map with health-toned markers and geofence circles"
```

---

### Task 2: Popup content — health, fuel, odometer, "More details" link

**Files:**
- Modify: `apps/web/components/map/MapCanvas.tsx` (richer popup content)
- Modify: `apps/web/components/map/__tests__/MapCanvas.test.tsx` (assert popup content)

**Interfaces:**
- Consumes: `MapMarkerData`'s optional `healthScore`/`fuelPct`/`odometerKm` fields (already declared in Task 1).
- Produces: popup renders label + health badge + fuel + odometer + a `/fleet/vehicles/:id` link. Task 3 builds the page this links to; Task 4 supplies the actual joined data.

- [ ] **Step 1: Add a popup-content test case**

Append to `apps/web/components/map/__tests__/MapCanvas.test.tsx`'s `describe` block:

```typescript
  it("shows health/fuel/odometer in the popup when present, and a More details link", () => {
    const richMarker: MapMarkerData = {
      ...marker,
      healthScore: 91,
      fuelPct: 54,
      odometerKm: 15234,
    };
    render(<MapCanvas markers={[richMarker]} geofences={[]} />);

    expect(screen.getByText(/91/)).toBeInTheDocument();
    expect(screen.getByText(/54%/)).toBeInTheDocument();
    expect(screen.getByText(/15,234 km/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /more details/i });
    expect(link).toHaveAttribute("href", "/fleet/vehicles/asset-1");
  });

  it("degrades gracefully when fleet data is missing for a marker", () => {
    render(<MapCanvas markers={[marker]} geofences={[]} />);
    expect(screen.getByText("Truck 42")).toBeInTheDocument();
    expect(screen.queryByText(/fuel/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapCanvas.test.tsx`
Expected: FAIL — popup only renders `marker.label`, no health/fuel/odometer/link.

- [ ] **Step 3: Replace the `<Popup>{marker.label}</Popup>` with richer content**

In `apps/web/components/map/MapCanvas.tsx`, add the import:

```typescript
import Link from "next/link";
import { Badge } from "@gamopls/ui";
```

Replace the `<Marker>` block's popup with:

```typescript
      {markers.map((marker) => (
        <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={markerIcon(marker.healthScore)}>
          <Popup>
            <div style={{ minWidth: "160px" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{marker.label}</div>
              {marker.healthScore !== undefined && (
                <div style={{ marginBottom: "0.25rem" }}>
                  <Badge tone={healthTone(marker.healthScore)}>Health {marker.healthScore}</Badge>
                </div>
              )}
              {marker.fuelPct !== undefined && marker.fuelPct !== null && (
                <div style={{ fontSize: "0.75rem" }}>Fuel: {marker.fuelPct}%</div>
              )}
              {marker.odometerKm !== undefined && marker.odometerKm !== null && (
                <div style={{ fontSize: "0.75rem" }}>Odometer: {marker.odometerKm.toLocaleString()} km</div>
              )}
              <Link href={`/fleet/vehicles/${marker.id}`} style={{ fontSize: "0.75rem", color: "#22d3ee", display: "inline-block", marginTop: "0.4rem" }}>
                More details →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapCanvas.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/map/MapCanvas.tsx apps/web/components/map/__tests__/MapCanvas.test.tsx
git commit -m "feat(web): show health/fuel/odometer and a More details link in marker popups"
```

---

### Task 3: Vehicle detail stub page

**Files:**
- Modify: `apps/web/components/fleet/api.ts` (add `getVehicle`)
- Create: `apps/web/app/fleet/vehicles/[id]/page.tsx`
- Test: `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `Asset`, `DriverAssignment` types, `listAssignmentHistory` (all already in `components/fleet/types.ts`/`api.ts` from sub-project A).
- Produces: `getVehicle(id: string): Promise<Asset>` (calls `GET /api/fleet/assets/:id`); `/fleet/vehicles/:id` route rendering the asset's full detail. This is the entry point sub-project C will later enhance with the digital twin visualization — same route, this task only builds the V1 read-only content.

- [ ] **Step 1: Add `getVehicle` to the API client**

In `apps/web/components/fleet/api.ts`, add after `createVehicle`:

```typescript
export async function getVehicle(id: string): Promise<Asset> {
  const res = await fetch(`/api/fleet/assets/${id}`);
  return parseOrThrow<Asset>(res);
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VehicleDetailPage from "../[id]/page";
import * as fleetApi from "@/components/fleet/api";

vi.mock("@/components/fleet/api");
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "asset-1" }) }));

afterEach(() => cleanup());

describe("VehicleDetailPage", () => {
  it("loads and displays the vehicle's details and current assignment", async () => {
    vi.mocked(fleetApi.getVehicle).mockResolvedValue({
      id: "asset-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
      type: "vehicle",
      display_label: "TN-01-AB-1234 (van)",
      health_score: 91,
      telemetry: { fuel_pct: 60 },
      telemetry_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vehicleDetails: {
        assetId: "asset-1",
        plateNumber: "TN-01-AB-1234",
        vehicleType: "van",
        fuelType: "diesel",
        make: "Tata",
        model: "Ace",
        color: null,
        year: null,
        vin: null,
        fuelCapacityLiters: null,
        odometerKm: 12000,
      },
    });
    vi.mocked(fleetApi.listAssignmentHistory).mockResolvedValue([
      {
        id: "assign-1",
        org_id: "org-1",
        fleet_id: "fleet-1",
        asset_id: "asset-1",
        driver_id: "driver-1",
        assigned_at: new Date().toISOString(),
        unassigned_at: null,
      },
    ]);

    render(<VehicleDetailPage />);

    await waitFor(() => expect(screen.getByText("TN-01-AB-1234 (van)")).toBeInTheDocument());
    expect(screen.getByText(/91/)).toBeInTheDocument();
    expect(screen.getByText(/12,000 km/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run app/fleet/vehicles`
Expected: FAIL — `Cannot find module '../[id]/page'`.

- [ ] **Step 4: Write the page**

Create `apps/web/app/fleet/vehicles/[id]/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "@/components/fleet/api";
import type { Asset, DriverAssignment } from "@/components/fleet/types";

function healthTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [assetData, historyData] = await Promise.all([
          fleetApi.getVehicle(params.id),
          fleetApi.listAssignmentHistory(params.id),
        ]);
        setAsset(assetData);
        setHistory(historyData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load vehicle");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading vehicle" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          {error ?? "Vehicle not found"}
        </p>
      </Card>
    );
  }

  const current = history.find((a) => a.unassigned_at === null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>

      <Card className="border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Badge tone={healthTone(asset.health_score)}>Health {asset.health_score}</Badge>
          {typeof asset.telemetry.fuel_pct === "number" && (
            <span className="text-sm text-muted-foreground">Fuel: {asset.telemetry.fuel_pct}%</span>
          )}
        </div>
        {asset.vehicleDetails && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Plate: {asset.vehicleDetails.plateNumber}</div>
            <div>Type: {asset.vehicleDetails.vehicleType}</div>
            <div>Odometer: {asset.vehicleDetails.odometerKm.toLocaleString()} km</div>
            {asset.vehicleDetails.make && <div>Make/Model: {asset.vehicleDetails.make} {asset.vehicleDetails.model}</div>}
          </div>
        )}
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-3">Driver assignment</h2>
        {current ? (
          <p className="text-sm text-foreground">Currently assigned to driver {current.driver_id}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No driver currently assigned.</p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run app/fleet/vehicles`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/fleet/api.ts apps/web/app/fleet/vehicles
git commit -m "feat(web): add vehicle detail stub page (entry point for sub-project C)"
```

---

### Task 4: Wire `MapCanvas` into `MapView`

**Files:**
- Modify: `apps/web/components/map/MapView.tsx`
- Modify: `apps/web/components/map/__tests__/MapView.test.tsx`

**Interfaces:**
- Consumes: `MapCanvas`, `MapMarkerData` (Task 1-2), `listVehicles` from `@/components/fleet/api` (sub-project A).
- Produces: the Map page renders `MapCanvas` above the existing `AssetPositionsTable`, with markers enriched by fleet asset data.

- [ ] **Step 1: Add a test asserting the map renders alongside the table**

Add to `apps/web/components/map/__tests__/MapView.test.tsx`, near the top, mock `next/dynamic`-loaded `MapCanvas` and the fleet API:

```typescript
vi.mock("../MapCanvas", () => ({
  MapCanvas: ({ markers }: { markers: { label: string }[] }) => (
    <div data-testid="map-canvas">{markers.map((m) => m.label).join(",")}</div>
  ),
}));
vi.mock("@/components/fleet/api", () => ({
  listVehicles: vi.fn(async () => []),
}));
```

Add a new test case inside the `describe("MapView")` block:

```typescript
  it("renders the map canvas above the positions table", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/positions")) {
        return jsonResponse({
          fleet_id: "fleet-1",
          positions: [
            { id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", icon: "generic-asset-marker", label: "Truck 42", lat: 13.08, lng: 80.27, positionUpdatedAt: "2026-07-08T10:00:00.000Z" },
          ],
        });
      }
      if (url.includes("/geofences")) return jsonResponse({ geofences: [] });
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MapView fleetId="fleet-1" pollIntervalMs={100000} />);

    await waitFor(() => expect(screen.getByTestId("map-canvas")).toBeInTheDocument());
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Truck 42");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapView.test.tsx`
Expected: FAIL — `MapCanvas` isn't rendered by `MapView` yet.

- [ ] **Step 3: Wire `MapCanvas` into `MapView.tsx`**

In `apps/web/components/map/MapView.tsx`, add imports:

```typescript
import dynamic from "next/dynamic";
import { listVehicles } from "@/components/fleet/api";
import type { Asset } from "@/components/fleet/types";
import type { MapMarkerData } from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas").then((m) => m.MapCanvas), { ssr: false });
```

Add state for fleet assets, alongside the existing `positions`/`geofences` state:

```typescript
  const [vehicleAssets, setVehicleAssets] = useState<Asset[]>([]);
```

Add a load function and effect, mirroring the existing `loadGeofences` pattern:

```typescript
  const loadVehicleAssets = useCallback(async () => {
    try {
      const data = await listVehicles();
      setVehicleAssets(data);
    } catch {
      // Non-fatal: markers just render without health/fuel/odometer if this fails.
      setVehicleAssets([]);
    }
  }, []);

  useEffect(() => {
    void loadVehicleAssets();
  }, [loadVehicleAssets]);
```

Add a join before the `return`:

```typescript
  const assetsById = new Map(vehicleAssets.map((a) => [a.id, a]));
  const markers: MapMarkerData[] = positions.map((p) => {
    const asset = assetsById.get(p.id);
    return {
      id: p.id,
      icon: p.icon,
      label: p.label,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading,
      speed: p.speed,
      positionUpdatedAt: p.positionUpdatedAt,
      healthScore: asset?.health_score,
      fuelPct: typeof asset?.telemetry.fuel_pct === "number" ? asset.telemetry.fuel_pct : null,
      odometerKm: asset?.vehicleDetails?.odometerKm ?? null,
    };
  });
```

Insert `<MapCanvas markers={markers} geofences={geofences} />` wrapped in a `Card`, directly above the existing "Active Asset Feed" `Card`:

```typescript
      <Card className="border border-border bg-card p-4">
        <MapCanvas markers={markers} geofences={geofences} />
      </Card>

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/map/__tests__/MapView.test.tsx`
Expected: PASS, all tests (existing + new).

- [ ] **Step 5: Run the full `apps/web` test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests PASS, no regressions in Board/Chat/Hub/Fleet suites.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/map/MapView.tsx apps/web/components/map/__tests__/MapView.test.tsx
git commit -m "feat(web): wire MapCanvas into MapView, joining position and fleet asset data"
```

---

## Post-plan verification

```bash
pnpm build && pnpm lint && pnpm test
```

Then smoke-test manually per this repo's UI-testing convention: `pnpm start:all`, open the Map page, confirm the Leaflet map renders with OpenStreetMap tiles, click a marker, confirm the popup shows health/fuel/odometer and a working "More details" link to `/fleet/vehicles/:id`.
