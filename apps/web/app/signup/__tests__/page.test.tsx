// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SignupPage from "../page";

const { pushMock, refreshMock, searchParamsGet } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  searchParamsGet: vi.fn().mockReturnValue(null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  refreshMock.mockClear();
  searchParamsGet.mockReturnValue(null);
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SignupPage", () => {
  it("shows the org-name field when there is no invite token", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
  });

  it("hides the org-name field and shows a join message when an invite token is present", () => {
    searchParamsGet.mockReturnValue("some-invite-token");
    render(<SignupPage />);
    expect(screen.queryByLabelText(/company/i)).not.toBeInTheDocument();
  });

  it("submits new-org signup and redirects to /fleet on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, org_id: "org-1", fleet_id: "fleet-1" }));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme Fleet Co" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/signup", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fleet"));
  });

  it("submits invite-mode signup with invite_token instead of org_name", async () => {
    searchParamsGet.mockReturnValue("invite-abc");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, org_id: "org-1", fleet_id: "fleet-1" }));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "teammate@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Teammate" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "teammate@example.com", invite_token: "invite-abc" });
    expect(body).not.toHaveProperty("org_name");
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "An account with this email already exists" }, 409));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
