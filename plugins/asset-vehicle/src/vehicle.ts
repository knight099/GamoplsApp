import type {
  Alertable,
  AlertThreshold,
  Asset,
  Communicable,
  Locatable,
  Monitorable,
  Taskable,
} from "@gamopls/asset-contracts";
import type { FuelType } from "./vehicle-details.js";

export interface VehicleConstructorInput {
  id: string;
  org_id: string;
  fleet_id: string;
  pluginMetadata?: Record<string, unknown>;

  plateNumber: string;
  vehicleType: "truck" | "van" | "car" | "bike" | "bus" | "other";
  fuelType: FuelType;

  lat?: number;
  lng?: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt?: string;

  healthScore?: number;
  telemetry?: Record<string, unknown>;
  telemetryUpdatedAt?: string;

  alertThresholds?: AlertThreshold[];
  hasActiveAlert?: boolean;

  missionChannelId?: string | null;
  assignedTaskId?: string | null;
}

/**
 * Vehicle — the V1 concrete Asset Type Plugin implementation.
 *
 * Implements the base `Asset` contract plus all five role interfaces
 * (Locatable, Monitorable, Alertable, Communicable, Taskable). Module
 * services (map, chat, board, hub) only ever see this through those shared
 * interfaces — they must never import this class directly (CLAUDE.md).
 *
 * `getMapIcon()` / `getDisplayLabel()` are the LSP/OCP escape hatch: any
 * vehicle-specific rendering decision lives here, not in a consuming
 * service's `if (asset.type === 'vehicle')` branch (which must never exist).
 */
export class Vehicle implements Asset, Locatable, Monitorable, Alertable, Communicable, Taskable {
  readonly id: string;
  readonly org_id: string;
  readonly fleet_id: string;
  readonly type = "vehicle" as const;
  readonly pluginMetadata: Record<string, unknown>;

  // Vehicle-specific identity, not part of the shared Asset contract.
  readonly plateNumber: string;
  readonly vehicleType: "truck" | "van" | "car" | "bike" | "bus" | "other";
  readonly fuelType: FuelType;

  // Locatable
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;

  // Monitorable
  healthScore: number;
  telemetry: Record<string, unknown>;
  telemetryUpdatedAt: string;

  // Alertable
  alertThresholds: AlertThreshold[];
  hasActiveAlert: boolean;

  // Communicable
  missionChannelId: string | null;

  // Taskable
  assignedTaskId: string | null;

  constructor(input: VehicleConstructorInput) {
    this.id = input.id;
    this.org_id = input.org_id;
    this.fleet_id = input.fleet_id;
    this.pluginMetadata = input.pluginMetadata ?? {};

    this.plateNumber = input.plateNumber;
    this.vehicleType = input.vehicleType;
    this.fuelType = input.fuelType;

    this.lat = input.lat ?? 0;
    this.lng = input.lng ?? 0;
    this.heading = input.heading;
    this.speed = input.speed;
    this.positionUpdatedAt = input.positionUpdatedAt ?? new Date(0).toISOString();

    this.healthScore = input.healthScore ?? 100;
    this.telemetry = input.telemetry ?? {};
    this.telemetryUpdatedAt = input.telemetryUpdatedAt ?? new Date(0).toISOString();

    this.alertThresholds = input.alertThresholds ?? [];
    this.hasActiveAlert = input.hasActiveAlert ?? false;

    this.missionChannelId = input.missionChannelId ?? null;
    this.assignedTaskId = input.assignedTaskId ?? null;
  }

  /**
   * Icon identifier keyed off vehicle type, e.g. 'vehicle-truck',
   * 'vehicle-van'. Consuming services treat this as an opaque string to
   * resolve against their own icon set — they never need to know it came
   * from a vehicle.
   */
  getMapIcon(): string {
    return `vehicle-${this.vehicleType}`;
  }

  /** Plate number + vehicle type, e.g. "TN-09-AB-1234 (truck)". */
  getDisplayLabel(): string {
    return `${this.plateNumber} (${this.vehicleType})`;
  }
}
