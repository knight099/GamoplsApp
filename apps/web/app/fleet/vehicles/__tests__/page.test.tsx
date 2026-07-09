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
