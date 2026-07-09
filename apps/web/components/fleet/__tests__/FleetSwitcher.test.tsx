// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FleetSwitcher } from "../FleetSwitcher";
import * as fleetApi from "../api";

// vitest.config.ts here doesn't set test.globals: true, so jest-dom's
// self-registering "@testing-library/jest-dom" entry point (which calls the
// *global* expect.extend) can't find `expect`. Extend the vitest-scoped
// `expect` explicitly instead.
expect.extend(jestDomMatchers);

vi.mock("../api");

describe("FleetSwitcher", () => {
  afterEach(() => {
    // @testing-library/react's auto-cleanup relies on detecting a *global*
    // afterEach (vitest.config.ts here doesn't set test.globals: true), so
    // without this explicit call, DOM from earlier tests in this file
    // would leak between tests.
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("location", { reload: vi.fn() } as any);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists fleets and switches on selection", async () => {
    vi.mocked(fleetApi.listFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "North Fleet", created_at: "", updated_at: "" },
      { id: "fleet-2", org_id: "org-1", name: "South Fleet", created_at: "", updated_at: "" },
    ]);

    render(<FleetSwitcher currentFleetId="fleet-1" />);

    await waitFor(() => expect(screen.getByText("North Fleet")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Active fleet"), { target: { value: "fleet-2" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/switch-fleet",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
