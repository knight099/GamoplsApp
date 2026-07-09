// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehiclesPanel } from "../VehiclesPanel";
import * as fleetApi from "../api";

// vitest.config.ts here doesn't set test.globals: true, so jest-dom's
// self-registering "@testing-library/jest-dom" entry point (which calls the
// *global* expect.extend) can't find `expect`. Extend the vitest-scoped
// `expect` explicitly instead.
expect.extend(jestDomMatchers);

vi.mock("../api");

describe("VehiclesPanel", () => {
  afterEach(() => {
    // @testing-library/react's auto-cleanup relies on detecting a *global*
    // afterEach (vitest.config.ts here doesn't set test.globals: true), so
    // without this explicit call, DOM from earlier tests in this file
    // lingers and causes false "multiple elements" matches in later tests.
    cleanup();
  });

  it("loads and displays vehicles", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([
      {
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
          make: null,
          model: null,
          color: null,
          year: null,
          vin: null,
          fuelCapacityLiters: null,
          odometerKm: 12000,
        },
      },
    ]);

    render(<VehiclesPanel />);

    await waitFor(() => expect(screen.getByText("TN-01-AB-1234 (van)")).toBeInTheDocument());
    expect(screen.getByText(/91/)).toBeInTheDocument();
  });

  it("submits the add-vehicle form with only the required fields", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(fleetApi.createVehicle).mockResolvedValue({} as any);

    render(<VehiclesPanel />);
    await waitFor(() => expect(fleetApi.listVehicles).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Plate number"), { target: { value: "TN-02-CD-5678" } });
    fireEvent.click(screen.getByRole("button", { name: /add vehicle/i }));

    await waitFor(() =>
      expect(fleetApi.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ plateNumber: "TN-02-CD-5678", vehicleType: "car", fuelType: "petrol" }),
      ),
    );
  });
});
