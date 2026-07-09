/**
 * HTTP client for plugins/asset-vehicle's VehicleDetails API. This is the
 * ONLY way services/fleet reaches vehicle-specific data — never a direct
 * import of plugins/asset-vehicle (CLAUDE.md).
 */
export interface VehicleDetailsResponse {
  assetId: string;
  plateNumber: string;
  vehicleType: string;
  fuelType: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: string | null;
  vin: string | null;
  fuelCapacityLiters: number | null;
  odometerKm: number;
}

export interface MaintenanceRecordResponse {
  id: string;
  assetId: string;
  serviceType: string;
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}

export class VehiclePluginClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VehiclePluginClientError";
  }
}

export interface VehiclePluginClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class VehiclePluginClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VehiclePluginClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createVehicleDetails(input: {
    assetId: string;
    plateNumber: string;
    vehicleType: string;
    fuelType: string;
    make: string | null;
    model: string | null;
    color: string | null;
    year: string | null;
    vin: string | null;
    fuelCapacityLiters: number | null;
    odometerKm: number;
  }): Promise<VehicleDetailsResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/vehicle-details`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin create failed: ${res.status}`, res.status);
    }
    return (await res.json()) as VehicleDetailsResponse;
  }

  async getVehicleDetails(assetId: string): Promise<VehicleDetailsResponse | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/vehicle-details/${assetId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin get failed: ${res.status}`, res.status);
    }
    return (await res.json()) as VehicleDetailsResponse;
  }

  async createMaintenanceRecord(input: {
    assetId: string;
    serviceType: string;
    performedAt: string;
    odometerAtServiceKm: number;
  }): Promise<MaintenanceRecordResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/maintenance-records`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin maintenance create failed: ${res.status}`, res.status);
    }
    return (await res.json()) as MaintenanceRecordResponse;
  }

  async getMaintenanceRecords(assetId: string): Promise<MaintenanceRecordResponse[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/maintenance-records/${assetId}`);
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin maintenance list failed: ${res.status}`, res.status);
    }
    const body = (await res.json()) as { records: MaintenanceRecordResponse[] };
    return body.records;
  }
}
