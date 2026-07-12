// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
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
      telemetry: { fuel_pct: 60, engine_temp_c: 91, battery_pct: 76 },
      telemetry_updated_at: new Date().toISOString(),
      last_mileage_kmpl: 18.5,
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
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);

    render(<VehicleDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "TN-01-AB-1234 (van)" })).toBeInTheDocument());
    expect(screen.getByText(/12,000 km/)).toBeInTheDocument();
    expect(screen.getByTestId("hotspot-engine")).toBeInTheDocument();
    expect(screen.getByText(/18.5 km\/L/)).toBeInTheDocument();
  });

  it("shows the connect/preview card when telemetry_updated_at is null, and hides it after a poll picks up new data", async () => {
    vi.mocked(fleetApi.getVehicle)
      .mockResolvedValueOnce({
        id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
        display_label: "TN-01-AB-1234 (van)", health_score: 0, telemetry: {},
        telemetry_updated_at: null, last_mileage_kmpl: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        vehicleDetails: null,
      })
      .mockResolvedValueOnce({
        id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
        display_label: "TN-01-AB-1234 (van)", health_score: 90, telemetry: { fuel_pct: 80 },
        telemetry_updated_at: new Date().toISOString(), last_mileage_kmpl: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        vehicleDetails: null,
      });
    vi.mocked(fleetApi.listAssignmentHistory).mockResolvedValue([]);
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<VehicleDetailPage />);

    await waitFor(() => expect(screen.getByText("Connect this vehicle")).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(screen.queryByText("Connect this vehicle")).not.toBeInTheDocument());

    vi.useRealTimers();
  });

  it("calls previewTelemetry when 'Preview with live data' is clicked", async () => {
    vi.mocked(fleetApi.getVehicle).mockResolvedValue({
      id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
      display_label: "TN-01-AB-1234 (van)", health_score: 0, telemetry: {},
      telemetry_updated_at: null, last_mileage_kmpl: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      vehicleDetails: null,
    });
    vi.mocked(fleetApi.listAssignmentHistory).mockResolvedValue([]);
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);
    vi.mocked(fleetApi.previewTelemetry).mockResolvedValue({ published: true });

    render(<VehicleDetailPage />);
    await waitFor(() => expect(screen.getByText("Connect this vehicle")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /preview with live data/i }));

    await waitFor(() => expect(fleetApi.previewTelemetry).toHaveBeenCalledWith("asset-1"));
  });
});
