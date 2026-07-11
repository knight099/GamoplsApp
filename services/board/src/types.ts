import { z } from "zod";

/**
 * Mission/Task data model — services/board.
 *
 * ============================================================================
 * ARCHITECTURE CONSTRAINT (CLAUDE.md — the single most important rule this
 * service must uphold): "A Mission is asset-type-agnostic. Don't add
 * vehicle-specific fields to the Mission/Task tables in services/board.
 * Trip-specific data belongs on VehicleDetails (owned by
 * plugins/asset-vehicle), referenced by asset_id."
 *
 * Concretely:
 *   - Assets are referenced ONLY via the opaque `asset_id: string` field
 *     below. Nothing in this schema knows or cares whether that id points
 *     at a vehicle, a drone, a vessel, or any future asset type.
 *   - This schema must NEVER gain fields like `plateNumber`, `fuelType`,
 *     `tripLeg`, `vin`, `driverLicense`, etc. Those belong entirely to
 *     plugins/asset-vehicle's VehicleDetails table, joined only by
 *     asset_id, in that plugin's own storage — never here.
 *   - services/board must never import from plugins/asset-vehicle and must
 *     never branch on asset type.
 *
 * `__tests__/schema-agnostic.test.ts` asserts this constraint at the field
 * level so a reviewer (human or CI) can catch a violation the moment a
 * vehicle-specific field is added to either shape below.
 * ============================================================================
 */

export const missionStatusSchema = z.enum(["active", "completed", "archived"]);
export type MissionStatus = z.infer<typeof missionStatusSchema>;

export const taskStatusSchema = z.enum(["draft", "open", "in_progress", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const missionSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: missionStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Mission = z.infer<typeof missionSchema>;

/** Generic, asset-type-agnostic list of fields this schema is allowed to have. */
export const ALLOWED_MISSION_FIELDS = Object.keys(missionSchema.shape) as (keyof Mission)[];

/** Request-body schema: tenancy comes from the gateway-signed scope header
 * (x-gamopls-scope), NEVER from the body (suggestions.md S-1). */
export const createMissionBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  status: missionStatusSchema.default("active"),
});
export type CreateMissionBody = z.infer<typeof createMissionBodySchema>;
/** Repo-facing input: body plus the header-derived tenant scope. */
export type CreateMissionInput = CreateMissionBody & { org_id: string; fleet_id: string };

export const updateMissionInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: missionStatusSchema.optional(),
});
export type UpdateMissionInput = z.infer<typeof updateMissionInputSchema>;

export const taskSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  /** The Mission this Task belongs to. Nullable: draft tasks created from a
   * TaskSuggested event have no mission assigned yet until triaged. */
  mission_id: z.string().min(1).nullable(),
  title: z.string().min(1),
  description: z.string().default(""),
  status: taskStatusSchema,
  /**
   * Opaque reference to the assigned asset (any type: vehicle, drone,
   * vessel, ...). Never a foreign key into a plugin's own tables, never
   * joined against plugin-owned data from within this service.
   */
  asset_id: z.string().min(1).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Task = z.infer<typeof taskSchema>;

/** Generic, asset-type-agnostic list of fields this schema is allowed to have. */
export const ALLOWED_TASK_FIELDS = Object.keys(taskSchema.shape) as (keyof Task)[];

/**
 * Fields that must NEVER appear on Mission or Task — this is the
 * enforceable, reviewable denylist backing the CLAUDE.md rule. Extend this
 * list (never the schemas above) if a future PR is tempted to add
 * type-specific fields directly to board's tables.
 */
export const FORBIDDEN_ASSET_SPECIFIC_FIELDS = [
  "plateNumber",
  "vin",
  "fuelType",
  "tripLeg",
  "driverLicense",
  "odometer",
  "vehicleType",
  "droneModel",
  "vesselImo",
] as const;

/** Request-body schema: tenancy comes from the gateway-signed scope header
 * (x-gamopls-scope), NEVER from the body (suggestions.md S-1). */
export const createTaskBodySchema = z.object({
  mission_id: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
  status: taskStatusSchema.default("open"),
  asset_id: z.string().min(1).nullable().default(null),
});
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
/** Repo-facing input: body plus the header-derived tenant scope. */
export type CreateTaskInput = CreateTaskBody & { org_id: string; fleet_id: string };

export const updateTaskInputSchema = z.object({
  mission_id: z.string().min(1).nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const assignTaskInputSchema = z.object({
  asset_id: z.string().min(1).nullable(),
});
export type AssignTaskInput = z.infer<typeof assignTaskInputSchema>;
