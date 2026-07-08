/**
 * Plugin self-registration client.
 *
 * HTTP contract (against services/registry, Phase 3 — not built yet at the
 * time this client was written, deliberately stubbed/mocked in tests):
 *
 *   POST {registryUrl}/plugins/register
 *   Content-Type: application/json
 *
 *   Request body:
 *     {
 *       "type": string,              // e.g. "vehicle" — matches Asset.type
 *       "capabilities": string[],    // e.g. ["locatable", "monitorable", "alertable", "communicable", "taskable"]
 *       "endpoint": string           // base URL this plugin can be reached at, if the registry needs to call back
 *     }
 *
 *   Success response: any 2xx status. Body is not required/parsed by this
 *   client (the registry may return the created registration record, but
 *   this client does not depend on its shape).
 *
 *   Failure response: any non-2xx status, or a network-level throw from the
 *   HTTP layer (e.g. fetch rejecting on connection refused). This client
 *   retries a bounded number of times on failure, then rejects.
 */

export interface PluginRegistrationMetadata {
  type: string;
  capabilities: string[];
  endpoint: string;
}

export interface RegisterPluginOptions {
  /** Number of attempts total (including the first). Default 3. */
  maxAttempts?: number;
  /** Delay in ms between retries. Default 200. Kept simple — no backoff curve. */
  retryDelayMs?: number;
  /**
   * Injectable HTTP layer for testing — defaults to the global `fetch`.
   * Must have the same signature as the WHATWG fetch function.
   */
  fetchImpl?: typeof fetch;
}

export class PluginRegistrationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PluginRegistrationError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registers this plugin with the registry service at `registryUrl`.
 *
 * POSTs to `{registryUrl}/plugins/register` with `metadata` as the JSON
 * body. Retries on failure (non-2xx response or thrown network error) up to
 * `maxAttempts` times with a fixed delay between attempts. Never contacts a
 * real registry during tests — callers must inject `fetchImpl`.
 */
export async function registerPlugin(
  registryUrl: string,
  metadata: PluginRegistrationMetadata,
  options: RegisterPluginOptions = {},
): Promise<void> {
  const { maxAttempts = 3, retryDelayMs = 200, fetchImpl = fetch } = options;

  const url = `${registryUrl.replace(/\/+$/, "")}/plugins/register`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata),
      });

      if (response.ok) {
        return;
      }

      lastError = new PluginRegistrationError(
        `Registry responded with status ${response.status} for ${url}`,
      );
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw new PluginRegistrationError(
    `Failed to register plugin with registry at ${url} after ${maxAttempts} attempt(s)`,
    lastError,
  );
}
