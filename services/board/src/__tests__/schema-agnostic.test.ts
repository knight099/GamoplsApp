import { describe, expect, it } from "vitest";
import {
  ALLOWED_MISSION_FIELDS,
  ALLOWED_TASK_FIELDS,
  FORBIDDEN_ASSET_SPECIFIC_FIELDS,
  missionSchema,
  taskSchema,
} from "../types.js";

/**
 * Enforces CLAUDE.md's most important rule for this service: "A Mission is
 * asset-type-agnostic. Don't add vehicle-specific fields to the
 * Mission/Task tables in services/board." This test fails loudly the
 * moment a vehicle/drone/vessel-specific field is added to either schema,
 * so the constraint is caught in CI/code review, not just documentation.
 */
describe("Mission/Task schema is asset-type-agnostic", () => {
  it("Mission schema contains none of the forbidden asset-specific fields", () => {
    for (const forbidden of FORBIDDEN_ASSET_SPECIFIC_FIELDS) {
      expect(ALLOWED_MISSION_FIELDS).not.toContain(forbidden);
      expect(Object.prototype.hasOwnProperty.call(missionSchema.shape, forbidden)).toBe(false);
    }
  });

  it("Task schema contains none of the forbidden asset-specific fields", () => {
    for (const forbidden of FORBIDDEN_ASSET_SPECIFIC_FIELDS) {
      expect(ALLOWED_TASK_FIELDS).not.toContain(forbidden);
      expect(Object.prototype.hasOwnProperty.call(taskSchema.shape, forbidden)).toBe(false);
    }
  });

  it("Mission schema is exactly the generic, asset-agnostic field set", () => {
    expect(ALLOWED_MISSION_FIELDS.sort()).toEqual(
      ["id", "org_id", "fleet_id", "title", "description", "status", "created_at", "updated_at"].sort(),
    );
  });

  it("Task schema is exactly the generic, asset-agnostic field set — asset referenced only via opaque asset_id", () => {
    expect(ALLOWED_TASK_FIELDS.sort()).toEqual(
      [
        "id",
        "org_id",
        "fleet_id",
        "mission_id",
        "title",
        "description",
        "status",
        "asset_id",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });

  it("Task.asset_id is a plain string reference, not a nested/joined asset object", () => {
    const shape = taskSchema.shape.asset_id;
    // zod nullable(string) — parsing a nested object must fail, proving
    // this field can never carry embedded plugin-owned (e.g. vehicle) data.
    const result = shape.safeParse({ plateNumber: "TN-01-AB-1234" });
    expect(result.success).toBe(false);
  });
});
