export interface MaintenanceSuggestion {
  asset_id: string;
  service_type: string;
  suggested_at_odometer_km: number;
}

export interface MaintenanceSuggestionRepository {
  get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null>;
  upsert(org_id: string, fleet_id: string, asset_id: string, service_type: string, suggested_at_odometer_km: number): Promise<void>;
}
