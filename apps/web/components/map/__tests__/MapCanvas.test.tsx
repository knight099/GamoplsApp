// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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

afterEach(() => cleanup());

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
