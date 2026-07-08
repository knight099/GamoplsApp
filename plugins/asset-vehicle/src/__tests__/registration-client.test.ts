import { describe, expect, it, vi } from "vitest";
import { PluginRegistrationError, registerPlugin } from "../registration-client.js";

const metadata = {
  type: "vehicle",
  capabilities: ["locatable", "monitorable", "alertable", "communicable", "taskable"],
  endpoint: "http://asset-vehicle-plugin.local",
};

describe("registerPlugin", () => {
  it("POSTs to {registryUrl}/plugins/register with the expected contract on success", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    });

    await registerPlugin("http://registry.local", metadata, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://registry.local/plugins/register");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual(metadata);
  });

  it("strips a trailing slash from registryUrl before building the endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    await registerPlugin("http://registry.local/", metadata, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://registry.local/plugins/register");
  });

  it("retries on non-2xx response, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) {
        return new Response(null, { status: 503 });
      }
      return new Response(null, { status: 200 });
    });

    await registerPlugin("http://registry.local", metadata, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 3,
      retryDelayMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries on thrown network error, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) {
        throw new Error("ECONNREFUSED");
      }
      return new Response(null, { status: 200 });
    });

    await registerPlugin("http://registry.local", metadata, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 3,
      retryDelayMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects with PluginRegistrationError after exhausting all retry attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(
      registerPlugin("http://registry.local", metadata, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 3,
        retryDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(PluginRegistrationError);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never contacts a real network endpoint — fetchImpl is always the injected mock", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await registerPlugin("http://registry.local", metadata, { fetchImpl: fetchImpl as unknown as typeof fetch });
    // Sanity: the only "network" call in this suite is the mock above.
    expect(fetchImpl).toHaveBeenCalled();
  });
});
