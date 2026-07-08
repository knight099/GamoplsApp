// @vitest-environment jsdom
//
// apps/web's default vitest environment is "node" (see
// apps/web/vitest.config.ts — lib/__tests__/gateway-proxy.test.ts needs
// NextRequest, not a DOM). This file overrides to jsdom per-file via the
// magic comment above rather than changing the shared config, so it
// doesn't affect other suites in this workspace.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardView } from "../BoardView";
import type { Mission, Task } from "../types";

const MISSION_A: Mission = {
  id: "mission-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  title: "Chennai loop",
  description: "Daily depot run",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const TASK_OPEN: Task = {
  id: "task-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  mission_id: "mission-1",
  title: "Deliver parcel batch",
  description: "Batch #42",
  status: "open",
  asset_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const TASK_DRAFT: Task = {
  id: "task-2",
  org_id: "org-1",
  fleet_id: "fleet-1",
  mission_id: null,
  title: "Investigate low battery alert",
  description: "Auto-suggested from AI health engine",
  status: "draft",
  asset_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function mockFetchSequence(handlers: Record<string, (init?: RequestInit) => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      for (const [key, handler] of Object.entries(handlers)) {
        if (url.includes(key)) return handler(init);
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BoardView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // @testing-library/react's auto-cleanup relies on detecting a *global*
    // afterEach (vitest.config.ts here doesn't set test.globals: true), so
    // without this explicit call, DOM from earlier tests in this file
    // lingers and causes false "multiple elements" matches in later tests.
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a loading state, then renders missions and tasks, flagging draft tasks as AI Suggested", async () => {
    mockFetchSequence({
      "/api/board/missions": () => jsonResponse({ missions: [MISSION_A] }),
      "/api/board/tasks": () => jsonResponse({ tasks: [TASK_OPEN, TASK_DRAFT] }),
    });

    render(<BoardView />);

    expect(screen.getByLabelText("Loading board")).toBeDefined();

    await waitFor(() => expect(screen.getByText("Deliver parcel batch")).toBeDefined());

    expect(screen.getAllByText("Chennai loop").length).toBeGreaterThan(0);
    expect(screen.getByText("Investigate low battery alert")).toBeDefined();
    expect(screen.getByText("AI Suggested")).toBeDefined();
    expect(screen.getByText("1 AI-suggested draft to triage")).toBeDefined();

    // asset_id is opaque and unresolved — no vehicle-specific rendering.
    expect(screen.queryByText(/plate/i)).toBeNull();
  });

  it("shows an error state with a retry option when the gateway call fails", async () => {
    mockFetchSequence({
      "/api/board/missions": () => jsonResponse({ error: "upstream unavailable" }, 502),
      "/api/board/tasks": () => jsonResponse({ tasks: [] }),
    });

    render(<BoardView />);

    await waitFor(() => expect(screen.getByText("upstream unavailable")).toBeDefined());
    expect(screen.getByText("Retry")).toBeDefined();
  });

  it("shows an empty state when there are no tasks", async () => {
    mockFetchSequence({
      "/api/board/missions": () => jsonResponse({ missions: [] }),
      "/api/board/tasks": () => jsonResponse({ tasks: [] }),
    });

    render(<BoardView />);

    await waitFor(() => expect(screen.getByText("No tasks match the current filters.")).toBeDefined());
    expect(screen.getByText("No missions yet — create one above.")).toBeDefined();
  });

  it("creates a new mission via the gateway and adds it to the list", async () => {
    const createdMission: Mission = { ...MISSION_A, id: "mission-2", title: "New mission title" };
    mockFetchSequence({
      "/api/board/tasks/": () => jsonResponse({}),
      "/api/board/missions": (init) => {
        if (init?.method === "POST") return jsonResponse(createdMission, 201);
        return jsonResponse({ missions: [] });
      },
      "/api/board/tasks": () => jsonResponse({ tasks: [] }),
    });

    const user = userEvent.setup();
    render(<BoardView />);

    await waitFor(() => expect(screen.getByLabelText("Mission title")).toBeDefined());

    await user.type(screen.getByLabelText("Mission title"), "New mission title");
    await user.click(screen.getByRole("button", { name: "Create mission" }));

    await waitFor(() => expect(screen.getAllByText("New mission title").length).toBeGreaterThan(0));
  });

  it("assigns a task to an asset id via the gateway", async () => {
    const assigned: Task = { ...TASK_OPEN, asset_id: "asset-99" };
    mockFetchSequence({
      "/api/board/missions": () => jsonResponse({ missions: [MISSION_A] }),
      "/api/board/tasks/task-1/assign": () => jsonResponse(assigned),
      "/api/board/tasks": () => jsonResponse({ tasks: [TASK_OPEN] }),
    });

    const user = userEvent.setup();
    render(<BoardView />);

    await waitFor(() => expect(screen.getByText("Deliver parcel batch")).toBeDefined());

    const assignInput = screen.getByLabelText("Asset id for Deliver parcel batch");
    await user.type(assignInput, "asset-99");
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(screen.getByText("asset-99")).toBeDefined());
  });
});
