// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView } from "../ChatView";
import type { ChatMessage, MissionChannel } from "../types";

// See MessageList.test.tsx — auto-cleanup isn't wired up without
// test.globals, so tear down the DOM explicitly between tests.
afterEach(cleanup);

const CHANNEL: MissionChannel = {
  id: "chan-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  mission_id: "mission-1",
  name: "Ops Channel",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const MESSAGE: ChatMessage = {
  id: "msg-1",
  channelId: "chan-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  senderType: "user",
  senderId: "user-1",
  body: "hello team",
  createdAt: "2026-01-01T00:01:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ChatView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads channels then messages for the auto-selected first channel via gateway routes only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/chat/channels") return jsonResponse({ channels: [CHANNEL] });
      if (url === "/api/chat/channels/chan-1/messages") return jsonResponse({ messages: [MESSAGE] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ChatView orgId="org-1" fleetId="fleet-1" userId="user-1" />);

    expect(await screen.findByText("Ops Channel")).toBeDefined();
    expect(await screen.findByText("hello team")).toBeDefined();

    for (const [url] of fetchMock.mock.calls) {
      const asString = typeof url === "string" ? url : (url as Request).url;
      expect(asString.startsWith("/api/chat/")).toBe(true);
    }
  });

  it("posts a new message to the selected channel and appends it to the list", async () => {
    const user = userEvent.setup();
    const newMessage: ChatMessage = { ...MESSAGE, id: "msg-2", body: "reinforcements en route" };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/chat/channels") return jsonResponse({ channels: [CHANNEL] });
      if (url === "/api/chat/channels/chan-1/messages" && (!init || init.method === undefined)) {
        return jsonResponse({ messages: [MESSAGE] });
      }
      if (url === "/api/chat/channels/chan-1/messages" && init?.method === "POST") {
        const payload = JSON.parse(init.body as string);
        expect(payload).toMatchObject({ senderType: "user", senderId: "user-1", body: "reinforcements en route" });
        return jsonResponse(newMessage, 201);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ChatView orgId="org-1" fleetId="fleet-1" userId="user-1" />);
    await screen.findByText("hello team");

    await user.type(screen.getByLabelText("Message"), "reinforcements en route");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("reinforcements en route")).toBeDefined();
  });

  it("creates a new channel and selects it, sending org_id/fleet_id in the body", async () => {
    const user = userEvent.setup();
    const created: MissionChannel = { ...CHANNEL, id: "chan-2", mission_id: "mission-2", name: "New Ops" };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/chat/channels" && init?.method === "POST") {
        const payload = JSON.parse(init.body as string);
        expect(payload).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "mission-2", name: "New Ops" });
        return jsonResponse(created, 201);
      }
      if (url === "/api/chat/channels") return jsonResponse({ channels: [] });
      if (url === "/api/chat/channels/chan-2/messages") return jsonResponse({ messages: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<ChatView orgId="org-1" fleetId="fleet-1" userId="user-1" />);
    await waitFor(() => expect(screen.getByText(/no mission channels yet/i)).toBeDefined());

    await user.type(screen.getByLabelText("Mission ID"), "mission-2");
    await user.type(screen.getByLabelText("Channel name"), "New Ops");
    await user.click(screen.getByRole("button", { name: "Create channel" }));

    expect(await screen.findByText("New Ops")).toBeDefined();
  });

  it("shows a channel-load error state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "backend down" }, 500));

    render(<ChatView orgId="org-1" fleetId="fleet-1" userId="user-1" />);

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "backend down");
  });
});
