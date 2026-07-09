import type { Asset } from "./types.js";

export interface CreateAssetInput {
  org_id: string;
  fleet_id: string;
  type: string;
  display_label: string;
}

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<Asset>;
  get(id: string, org_id: string, fleet_id: string): Promise<Asset | null>;
  list(org_id: string, fleet_id: string): Promise<Asset[]>;
  delete(id: string): Promise<void>;
  updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void>;
  updateMileage(id: string, last_mileage_kmpl: number | null): Promise<void>;
}
