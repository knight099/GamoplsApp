export { Vehicle } from "./vehicle.js";
export type { VehicleConstructorInput } from "./vehicle.js";

export type { VehicleDetails, TripLeg, FuelType } from "./vehicle-details.js";

export {
  registerPlugin,
  PluginRegistrationError,
} from "./registration-client.js";
export type {
  PluginRegistrationMetadata,
  RegisterPluginOptions,
} from "./registration-client.js";

export type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
export { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
export { PrismaVehicleDetailsRepository } from "./prisma-vehicle-details-repository.js";
export {
  createVehicleDetailsInputSchema,
  updateVehicleDetailsInputSchema,
  fuelTypeSchema,
  vehicleTypeSchema,
} from "./schemas.js";
export type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";
