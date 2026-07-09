import type { PrismaClient } from "@gamopls/db";
import type { MaintenanceSuggestion, MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";

export class PrismaMaintenanceSuggestionRepository implements MaintenanceSuggestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null> {
    const db = await this.prisma.maintenanceSuggestion.findUnique({
      where: { asset_id_service_type: { asset_id, service_type } },
    });
    return db ? { asset_id: db.asset_id, service_type: db.service_type, suggested_at_odometer_km: Number(db.suggested_at_odometer_km) } : null;
  }

  async upsert(
    org_id: string,
    fleet_id: string,
    asset_id: string,
    service_type: string,
    suggested_at_odometer_km: number,
  ): Promise<void> {
    await this.prisma.maintenanceSuggestion.upsert({
      where: { asset_id_service_type: { asset_id, service_type } },
      create: { org_id, fleet_id, asset_id, service_type, suggested_at_odometer_km },
      update: { suggested_at_odometer_km },
    });
  }
}
