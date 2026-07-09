import type { VehicleDetails } from "./vehicle-details.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

export class InMemoryVehicleDetailsRepository implements VehicleDetailsRepository {
  private readonly store = new Map<string, VehicleDetails>();

  async create(input: CreateVehicleDetailsInput): Promise<VehicleDetails> {
    const now = new Date().toISOString();
    const record: VehicleDetails = {
      assetId: input.assetId,
      plateNumber: input.plateNumber,
      vehicleType: input.vehicleType,
      make: input.make,
      model: input.model,
      color: input.color,
      year: input.year,
      vin: input.vin,
      fuelType: input.fuelType,
      fuelCapacityLiters: input.fuelCapacityLiters,
      odometerKm: input.odometerKm,
      currentTrip: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(input.assetId, record);
    return record;
  }

  async get(assetId: string): Promise<VehicleDetails | null> {
    return this.store.get(assetId) ?? null;
  }

  async update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null> {
    const existing = this.store.get(assetId);
    if (!existing) return null;
    const updated: VehicleDetails = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(assetId, updated);
    return updated;
  }
}
