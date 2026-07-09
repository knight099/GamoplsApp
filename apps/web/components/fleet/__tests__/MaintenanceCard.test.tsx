// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MaintenanceCard } from "../MaintenanceCard";
import * as fleetApi from "../api";

vi.mock("../api");
afterEach(() => cleanup());

describe("MaintenanceCard", () => {
  it("loads and lists past maintenance records", async () => {
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([
      { id: "rec-1", assetId: "asset-1", serviceType: "oil_change", performedAt: "2026-06-01T00:00:00.000Z", odometerAtServiceKm: 15000, createdAt: "2026-06-01T00:00:00.000Z" },
    ]);

    render(<MaintenanceCard assetId="asset-1" currentOdometerKm={16000} />);

    await waitFor(() => expect(screen.getByText(/oil_change/)).toBeInTheDocument());
    expect(screen.getByText(/15,000 km/)).toBeInTheDocument();
  });

  it("submits a new maintenance record defaulting odometer to the current reading", async () => {
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);
    vi.mocked(fleetApi.logMaintenance).mockResolvedValue({} as any);

    render(<MaintenanceCard assetId="asset-1" currentOdometerKm={16000} />);
    await waitFor(() => expect(fleetApi.listMaintenanceRecords).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /log maintenance/i }));

    await waitFor(() =>
      expect(fleetApi.logMaintenance).toHaveBeenCalledWith(
        "asset-1",
        expect.objectContaining({ serviceType: "oil_change", odometerAtServiceKm: 16000 }),
      ),
    );
  });
});
