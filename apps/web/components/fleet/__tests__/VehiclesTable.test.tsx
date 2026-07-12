// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VehiclesTable } from "../VehiclesTable";
import type { Asset } from "../types";

expect.extend(jestDomMatchers);

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: "TN-09-AB-1234",
    health_score: 85,
    telemetry: {},
    telemetry_updated_at: null,
    last_mileage_kmpl: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("VehiclesTable", () => {
  afterEach(() => cleanup());

  it("shows the empty state when there are no vehicles", () => {
    render(<VehiclesTable vehicles={[]} />);
    expect(screen.getByText(/No vehicles yet/)).toBeDefined();
  });

  it("renders a success-tone status chip for a healthy vehicle", () => {
    render(<VehiclesTable vehicles={[makeAsset({ health_score: 90 })]} />);
    expect(screen.getByText("90").getAttribute("data-tone")).toBe("success");
  });

  it("renders a danger-tone chip for a low health score", () => {
    render(<VehiclesTable vehicles={[makeAsset({ health_score: 30 })]} />);
    expect(screen.getByText("30").getAttribute("data-tone")).toBe("danger");
  });

  it("links each vehicle row to its detail page", () => {
    render(<VehiclesTable vehicles={[makeAsset({ id: "asset-42", display_label: "TN-42" })]} />);
    const link = screen.getByRole("link", { name: "TN-42" });
    expect(link.getAttribute("href")).toBe("/fleet/vehicles/asset-42");
  });
});
