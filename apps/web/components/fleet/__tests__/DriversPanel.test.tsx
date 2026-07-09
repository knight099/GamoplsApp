// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriversPanel } from "../DriversPanel";
import * as fleetApi from "../api";

vi.mock("../api");

// @testing-library/react's auto-cleanup relies on globalThis.afterEach,
// which isn't registered here (vitest.config.ts doesn't set test.globals),
// so clean up explicitly to avoid DOM bleeding across tests in this file.
afterEach(cleanup);

const baseAsset = {
  id: "asset-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  type: "vehicle",
  display_label: "TN-01-AB-1234 (van)",
  health_score: 91,
  telemetry: {},
  telemetry_updated_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  vehicleDetails: null,
};

describe("DriversPanel", () => {
  it("loads and displays drivers, and assigns a driver to a vehicle", async () => {
    vi.mocked(fleetApi.listDrivers).mockResolvedValue([
      {
        id: "driver-1",
        org_id: "org-1",
        fleet_id: "fleet-1",
        name: "Kumar S",
        phone: null,
        license_number: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([baseAsset]);
    vi.mocked(fleetApi.assignDriver).mockResolvedValue({} as any);

    render(<DriversPanel />);

    await waitFor(() => expect(screen.getByText("Kumar S")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Assign Kumar S to vehicle"), { target: { value: "asset-1" } });

    await waitFor(() => expect(fleetApi.assignDriver).toHaveBeenCalledWith("asset-1", "driver-1"));
  });

  it("submits the add-driver form with only a name", async () => {
    vi.mocked(fleetApi.listDrivers).mockResolvedValue([]);
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(fleetApi.createDriver).mockResolvedValue({} as any);

    render(<DriversPanel />);
    await waitFor(() => expect(fleetApi.listDrivers).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Driver name"), { target: { value: "Priya R" } });
    fireEvent.click(screen.getByRole("button", { name: /add driver/i }));

    await waitFor(() => expect(fleetApi.createDriver).toHaveBeenCalledWith(expect.objectContaining({ name: "Priya R" })));
  });
});
