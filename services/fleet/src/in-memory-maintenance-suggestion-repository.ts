import type { MaintenanceSuggestion, MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";

export class InMemoryMaintenanceSuggestionRepository implements MaintenanceSuggestionRepository {
  private readonly rows = new Map<string, MaintenanceSuggestion>();

  private key(asset_id: string, service_type: string): string {
    return `${asset_id}:${service_type}`;
  }

  async get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null> {
    return this.rows.get(this.key(asset_id, service_type)) ?? null;
  }

  async upsert(
    _org_id: string,
    _fleet_id: string,
    asset_id: string,
    service_type: string,
    suggested_at_odometer_km: number,
  ): Promise<void> {
    this.rows.set(this.key(asset_id, service_type), { asset_id, service_type, suggested_at_odometer_km });
  }
}
