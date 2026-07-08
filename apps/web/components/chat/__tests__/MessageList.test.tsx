// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { ChatMessage } from "../types";

// @testing-library/react's auto-cleanup relies on globalThis.afterEach,
// which isn't registered here (vitest.config.ts doesn't set test.globals),
// so clean up explicitly to avoid DOM bleeding across tests in this file.
afterEach(cleanup);

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    channelId: "chan-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    senderType: "user",
    senderId: "user-1",
    body: "hello team",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MessageList", () => {
  it("shows a loading state", () => {
    render(<MessageList messages={[]} loading error={null} />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("shows an error state", () => {
    render(<MessageList messages={[]} loading={false} error="boom" />);
    expect(screen.getByRole("alert").textContent).toBe("boom");
  });

  it("shows an empty state when there are no messages", () => {
    render(<MessageList messages={[]} loading={false} error={null} />);
    expect(screen.getByText(/no messages yet/i)).toBeDefined();
  });

  it("renders a user message without a system badge", () => {
    render(<MessageList messages={[makeMessage()]} loading={false} error={null} />);
    expect(screen.getByText("hello team")).toBeDefined();
    expect(screen.queryByText("System alert")).toBeNull();
  });

  it("renders a system message with a distinguishing badge", () => {
    render(
      <MessageList
        messages={[makeMessage({ id: "msg-2", senderType: "system", senderId: "system:alert-bridge", body: "Geofence exit detected" })]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText("System alert")).toBeDefined();
    expect(screen.getByText("Geofence exit detected")).toBeDefined();
  });

  it("renders a media reference as a link, not a file upload widget", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            media: { url: "https://hub.example/doc/1", filename: "report.pdf", mimeType: "application/pdf", size: 2048 },
          }),
        ]}
        loading={false}
        error={null}
      />,
    );
    const link = screen.getByRole("link", { name: /report\.pdf/ });
    expect(link.getAttribute("href")).toBe("https://hub.example/doc/1");
  });
});
