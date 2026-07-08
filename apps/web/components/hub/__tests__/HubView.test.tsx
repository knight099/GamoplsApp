// @vitest-environment jsdom
//
// apps/web's default vitest environment is "node" (see
// apps/web/vitest.config.ts). This file overrides to jsdom per-file via the
// magic comment above rather than changing the shared config, so it
// doesn't affect other suites in this workspace.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HubView } from "../HubView";
import type { HubDocument } from "../types";

const DOCUMENT_A: HubDocument = {
  id: "doc-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  filename: "maintenance-checklist.pdf",
  mimeType: "application/pdf",
  size: 20480,
  uploader: "user-1",
  description: "Monthly maintenance checklist",
  tags: ["maintenance", "checklist"],
  storageLocation: "local:doc-1",
  createdAt: "2026-07-01T10:00:00.000Z",
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

describe("HubView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // apps/web's vitest config doesn't set `test.globals: true`, so
    // @testing-library/react's implicit afterEach(cleanup) registration
    // never fires — unmount explicitly to avoid DOM/query bleed-through
    // between tests in this file.
    cleanup();
  });

  it("shows a loading state, then renders documents with their metadata", async () => {
    mockFetchSequence({
      "/api/hub/documents": () => jsonResponse({ documents: [DOCUMENT_A] }),
    });

    render(<HubView uploaderId="user-1" />);

    expect(screen.getByLabelText("Loading documents")).toBeDefined();

    await waitFor(() => expect(screen.getByText("maintenance-checklist.pdf")).toBeDefined());

    expect(screen.getByText("application/pdf")).toBeDefined();
    expect(screen.getByText("20.0 KB")).toBeDefined();
    expect(screen.getByText("user-1")).toBeDefined();
  });

  it("shows an error state when listing documents fails", async () => {
    mockFetchSequence({
      "/api/hub/documents": () => jsonResponse({ error: "upstream unavailable" }, 502),
    });

    render(<HubView uploaderId="user-1" />);

    await waitFor(() => expect(screen.getByText("upstream unavailable")).toBeDefined());
  });

  it("shows an empty state when there are no documents", async () => {
    mockFetchSequence({
      "/api/hub/documents": () => jsonResponse({ documents: [] }),
    });

    render(<HubView uploaderId="user-1" />);

    await waitFor(() =>
      expect(screen.getByTestId("data-table-empty").textContent).toContain("No documents uploaded yet."),
    );
  });

  it("uploads a file as base64 content and prepends it to the document list", async () => {
    const created: HubDocument = { ...DOCUMENT_A, id: "doc-2", filename: "notes.txt" };
    let uploadedBody: Record<string, unknown> | null = null;

    mockFetchSequence({
      "/api/hub/documents": (init) => {
        if (init?.method === "POST") {
          uploadedBody = JSON.parse(init.body as string);
          return jsonResponse(created, 201);
        }
        return jsonResponse({ documents: [DOCUMENT_A] });
      },
    });

    const user = userEvent.setup();
    render(<HubView uploaderId="user-1" />);

    await waitFor(() => expect(screen.getByText("maintenance-checklist.pdf")).toBeDefined());

    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    const input = screen.getByLabelText("Choose file") as HTMLInputElement;
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByText("notes.txt")).toBeDefined());

    expect(uploadedBody).not.toBeNull();
    // org_id/fleet_id are deliberately NOT expected here: the gateway
    // forces them as query params, not body fields (see types.ts).
    expect(uploadedBody).not.toHaveProperty("org_id");
    expect(uploadedBody).not.toHaveProperty("fleet_id");
    expect(uploadedBody!.uploader).toBe("user-1");
    expect(uploadedBody!.filename).toBe("notes.txt");
    expect(typeof uploadedBody!.content).toBe("string");
    // base64 of "hello world"
    expect(uploadedBody!.content).toBe(Buffer.from("hello world").toString("base64"));
  });

  it("shows a validation error when submitting the upload form without a file", async () => {
    mockFetchSequence({
      "/api/hub/documents": () => jsonResponse({ documents: [] }),
    });

    const user = userEvent.setup();
    render(<HubView uploaderId="user-1" />);

    await waitFor(() => expect(screen.getByTestId("data-table-empty")).toBeDefined());

    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(screen.getByText("Choose a file to upload.")).toBeDefined();
  });

  it("searches documents via the gateway and renders the keyword-match results", async () => {
    mockFetchSequence({
      "/api/hub/documents": () => jsonResponse({ documents: [] }),
      "/api/hub/search": () =>
        jsonResponse({
          results: [
            {
              documentId: "doc-1",
              filename: "maintenance-checklist.pdf",
              score: 3,
              snippet: 'filename matches "checklist"',
            },
          ],
        }),
    });

    const user = userEvent.setup();
    render(<HubView uploaderId="user-1" />);

    await waitFor(() => expect(screen.getByTestId("data-table-empty")).toBeDefined());

    await user.type(screen.getByLabelText("Search documents"), "checklist");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.getByText('filename matches "checklist"')).toBeDefined());
    expect(screen.getByText("Matches filename, description, and tags by keyword.")).toBeDefined();
    expect(screen.queryByText(/AI-powered/i)).toBeNull();
  });
});
