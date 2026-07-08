// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MapView } from "../MapView";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("MapView", () => {
  it("shows a loading spinner then renders fetched positions and geofences", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/positions")) {
        return jsonResponse({
          fleet_id: "fleet-1",
          positions: [
            {
              id: "asset-1",
              org_id: "org-1",
              fleet_id: "fleet-1",
              icon: "generic-asset-marker",
              label: "Truck 42",
              lat: 13.08,
              lng: 80.27,
              positionUpdatedAt: "2026-07-08T10:00:00.000Z",
            },
          ],
        });
      }
      if (url.includes("/geofences")) {
        return jsonResponse({ geofences: [] });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MapView fleetId="fleet-1" pollIntervalMs={100000} />);

    expect(screen.getByText("Map")).toBeDefined();

    await waitFor(() => expect(screen.getByText("Truck 42")).toBeDefined());
    expect(screen.getByText("generic-asset-marker")).toBeDefined();
    expect(screen.getByText("No geofences defined for this fleet yet.")).toBeDefined();

    const positionsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/map/fleets/fleet-1/positions"),
    );
    expect(positionsCall).toBeDefined();
  });

  it("renders an error state when the positions fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/positions")) {
          return jsonResponse({ error: "upstream unavailable" }, 502);
        }
        return jsonResponse({ geofences: [] });
      }),
    );

    render(<MapView fleetId="fleet-1" pollIntervalMs={100000} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toContain("upstream unavailable");
  });

  it("renders the empty state when the fleet has no asset positions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/positions")) {
          return jsonResponse({ fleet_id: "fleet-1", positions: [] });
        }
        return jsonResponse({ geofences: [] });
      }),
    );

    render(<MapView fleetId="fleet-1" pollIntervalMs={100000} />);

    await waitFor(() =>
      expect(screen.getByText("No assets reporting a position for this fleet yet.")).toBeDefined(),
    );
  });
});
