import { describe, expect, it } from "vitest";
import { InMemoryMaintenanceRecordRepository } from "../in-memory-maintenance-record-repository.js";

describe("InMemoryMaintenanceRecordRepository", () => {
  it("creates records and lists them for an asset, most recent first", async () => {
    const repo = new InMemoryMaintenanceRecordRepository();
    await repo.create({
      assetId: "asset-1",
      serviceType: "oil_change",
      performedAt: "2026-01-01T00:00:00.000Z",
      odometerAtServiceKm: 5000,
    });
    await repo.create({
      assetId: "asset-1",
      serviceType: "oil_change",
      performedAt: "2026-06-01T00:00:00.000Z",
      odometerAtServiceKm: 15000,
    });
    await repo.create({
      assetId: "asset-2",
      serviceType: "oil_change",
      performedAt: "2026-01-01T00:00:00.000Z",
      odometerAtServiceKm: 3000,
    });

    const records = await repo.list("asset-1");
    expect(records).toHaveLength(2);
    expect(records[0]!.odometerAtServiceKm).toBe(15000); // most recent first
  });

  it("returns an empty list for an asset with no records", async () => {
    const repo = new InMemoryMaintenanceRecordRepository();
    expect(await repo.list("nonexistent")).toEqual([]);
  });
});
