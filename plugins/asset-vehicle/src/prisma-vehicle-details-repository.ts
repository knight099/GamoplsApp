import type { PrismaClient } from "@gamopls/db";
import type { VehicleDetails } from "./vehicle-details.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

export class PrismaVehicleDetailsRepository implements VehicleDetailsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): VehicleDetails {
    return {
      assetId: db.asset_id,
      plateNumber: db.plate_number,
      vehicleType: db.vehicle_type,
      make: db.make,
      model: db.model,
      color: db.color,
      year: db.year,
      vin: db.vin,
      fuelType: db.fuel_type,
      fuelCapacityLiters: db.fuel_capacity_liters === null ? null : Number(db.fuel_capacity_liters),
      odometerKm: Number(db.odometer_km),
      currentTrip:
        db.trip_started_at === null
          ? null
          : {
              startedAt: db.trip_started_at.toISOString(),
              endedAt: db.trip_ended_at ? db.trip_ended_at.toISOString() : null,
              originLabel: db.trip_origin_label ?? "",
              destinationLabel: db.trip_destination_label ?? "",
              distanceKm: db.trip_distance_km === null ? null : Number(db.trip_distance_km),
            },
      createdAt: db.created_at.toISOString(),
      updatedAt: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateVehicleDetailsInput): Promise<VehicleDetails> {
    const db = await this.prisma.vehicleDetails.create({
      data: {
        asset_id: input.assetId,
        plate_number: input.plateNumber,
        vehicle_type: input.vehicleType,
        fuel_type: input.fuelType,
        make: input.make,
        model: input.model,
        color: input.color,
        year: input.year,
        vin: input.vin,
        fuel_capacity_liters: input.fuelCapacityLiters,
        odometer_km: input.odometerKm,
      },
    });
    return this.map(db);
  }

  async get(assetId: string): Promise<VehicleDetails | null> {
    const db = await this.prisma.vehicleDetails.findUnique({ where: { asset_id: assetId } });
    return db ? this.map(db) : null;
  }

  async update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null> {
    try {
      const db = await this.prisma.vehicleDetails.update({
        where: { asset_id: assetId },
        data: {
          ...(patch.odometerKm !== undefined ? { odometer_km: patch.odometerKm } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.year !== undefined ? { year: patch.year } : {}),
          ...(patch.vin !== undefined ? { vin: patch.vin } : {}),
          ...(patch.make !== undefined ? { make: patch.make } : {}),
          ...(patch.model !== undefined ? { model: patch.model } : {}),
        },
      });
      return this.map(db);
    } catch {
      return null;
    }
  }
}
