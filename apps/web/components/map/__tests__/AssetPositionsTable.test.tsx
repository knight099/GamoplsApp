// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssetPositionsTable } from "../AssetPositionsTable";
import type { AssetMarker } from "../types";

const MARKER: AssetMarker = {
  id: "asset-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  icon: "generic-asset-marker",
  label: "Truck 42",
  lat: 13.0827,
  lng: 80.2707,
  heading: 90,
  speed: 40,
  positionUpdatedAt: "2026-07-08T10:00:00.000Z",
};

describe("AssetPositionsTable", () => {
  it("renders the icon/label/position exactly as supplied, with no type branching", () => {
    render(<AssetPositionsTable positions={[MARKER]} />);
    expect(screen.getByText("generic-asset-marker")).toBeDefined();
    expect(screen.getByText("Truck 42")).toBeDefined();
    expect(screen.getByText("13.08270, 80.27070")).toBeDefined();
    expect(screen.getByText("90°")).toBeDefined();
  });

  it("shows an em dash for missing heading/speed", () => {
    const { heading: _heading, speed: _speed, ...rest } = MARKER;
    render(<AssetPositionsTable positions={[rest as AssetMarker]} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });

  it("renders the DataTable empty state when there are no positions", () => {
    render(<AssetPositionsTable positions={[]} />);
    expect(screen.getByTestId("data-table-empty").textContent).toContain(
      "No assets reporting a position",
    );
  });
});
