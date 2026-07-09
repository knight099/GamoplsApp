import { randomUUID } from "node:crypto";
import type { AssetRepository, CreateAssetInput } from "./asset-repository.js";
import type { Asset } from "./types.js";

export class InMemoryAssetRepository implements AssetRepository {
  private readonly rows: Asset[] = [];

  async create(input: CreateAssetInput): Promise<Asset> {
    const now = new Date().toISOString();
    const asset: Asset = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      type: input.type,
      display_label: input.display_label,
      health_score: 100,
      telemetry: {},
      telemetry_updated_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.push(asset);
    return asset;
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Asset | null> {
    return this.rows.find((a) => a.id === id && a.org_id === org_id && a.fleet_id === fleet_id) ?? null;
  }

  async list(org_id: string, fleet_id: string): Promise<Asset[]> {
    return this.rows.filter((a) => a.org_id === org_id && a.fleet_id === fleet_id);
  }

  async delete(id: string): Promise<void> {
    const idx = this.rows.findIndex((a) => a.id === id);
    if (idx !== -1) this.rows.splice(idx, 1);
  }

  async updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void> {
    const asset = this.rows.find((a) => a.id === id);
    if (!asset) return;
    asset.health_score = health_score;
    asset.telemetry = telemetry;
    asset.telemetry_updated_at = new Date().toISOString();
    asset.updated_at = asset.telemetry_updated_at;
  }
}
