import { describe, expect, it } from "vitest";
import { InMemoryVehicleDetailsRepository } from "../in-memory-vehicle-details-repository.js";

describe("InMemoryVehicleDetailsRepository", () => {
  it("creates, gets, and updates a vehicle details record", async () => {
    const repo = new InMemoryVehicleDetailsRepository();

    const created = await repo.create({
      assetId: "asset-1",
      plateNumber: "TN-09-AB-1234",
      vehicleType: "truck",
      fuelType: "diesel",
      make: null,
      model: null,
      color: null,
      year: null,
      vin: null,
      fuelCapacityLiters: null,
      odometerKm: 0,
    });
    expect(created.plateNumber).toBe("TN-09-AB-1234");

    const fetched = await repo.get("asset-1");
    expect(fetched?.plateNumber).toBe("TN-09-AB-1234");

    const updated = await repo.update("asset-1", { odometerKm: 1500 });
    expect(updated?.odometerKm).toBe(1500);

    expect(await repo.get("nonexistent")).toBeNull();
  });
});
