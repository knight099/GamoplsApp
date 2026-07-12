// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OrgPage from "../page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ORG = {
  id: "org-1",
  name: "Acme Fleet Co",
  invite_link: "http://web.local/signup?invite=abc123",
  members: [
    { id: "u1", email: "owner@example.com", name: "Owner", role: "owner", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "u2", email: "teammate@example.com", name: "Teammate", role: "fleet_manager", created_at: "2026-01-02T00:00:00.000Z" },
  ],
};

describe("OrgPage", () => {
  it("loads and displays the org name, invite link, and members", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ORG));
    render(<OrgPage />);

    expect(await screen.findByText("Acme Fleet Co")).toBeInTheDocument();
    expect(screen.getByText(ORG.invite_link)).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("teammate@example.com")).toBeInTheDocument();
  });

  it("regenerates the invite link on click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/org/invite")) return jsonResponse({ invite_link: "http://web.local/signup?invite=NEW" });
      return jsonResponse(ORG);
    });
    render(<OrgPage />);
    await screen.findByText(ORG.invite_link);

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    await waitFor(() => expect(screen.getByText("http://web.local/signup?invite=NEW")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/org/invite", expect.objectContaining({ method: "POST" }));
  });

  it("shows an error state when the org fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "owner role required" }, 403));
    render(<OrgPage />);
    expect(await screen.findByText("owner role required")).toBeInTheDocument();
  });
});
