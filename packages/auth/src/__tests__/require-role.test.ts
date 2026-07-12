import { describe, expect, it } from "vitest";
import { requireRole } from "../require-role.js";

describe("requireRole", () => {
  it("allows a role in the allowed list", () => {
    expect(requireRole({ role: "owner" }, "owner")).toBe(true);
  });

  it("allows any of several roles", () => {
    expect(requireRole({ role: "fleet_manager" }, "owner", "fleet_manager")).toBe(true);
  });

  it("denies a role not in the allowed list", () => {
    expect(requireRole({ role: "fleet_manager" }, "owner")).toBe(false);
  });

  it("denies when no roles are allowed", () => {
    expect(requireRole({ role: "owner" })).toBe(false);
  });
});
