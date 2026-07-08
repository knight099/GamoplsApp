/**
 * AI Agent plugin registration client.
 *
 * CLAUDE.md: "board hosts AI Agent plugins." services/registry (Phase 3.5)
 * already exists as the one plugin registry ("CORE") in this repo — rather
 * than board standing up a second, competing registry, this client
 * forwards AI Agent plugin registrations to the real registry service,
 * keeping one source of truth for "what plugins/capabilities exist"
 * (asset-type plugins and agent plugins alike).
 *
 * This mirrors plugins/asset-vehicle's `registration-client.ts` pattern
 * (same retry/HTTP contract) rather than importing it — board must not
 * depend on `plugins/*` per CLAUDE.md, so the client is duplicated here at
 * the same shape instead of shared as a cross-plugin/service dependency.
 *
 * HTTP contract (services/registry):
 *   POST {registryUrl}/plugins/register
 *   Body: { type: string, capabilities: string[], endpoint: string }
 *   Success: any 2xx. Failure: non-2xx or thrown network error — retried.
 */

export interface AgentPluginMetadata {
  /** Registry plugin type discriminant for AI Agent plugins. */
  type: "ai-agent";
  capabilities: string[];
  endpoint: string;
}

export interface RegisterAgentPluginOptions {
  /** Number of attempts total (including the first). Default 3. */
  maxAttempts?: number;
  /** Delay in ms between retries. Default 200. */
  retryDelayMs?: number;
  /** Injectable HTTP layer for testing — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class AgentRegistrationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentRegistrationError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registers an AI Agent plugin with the registry service at `registryUrl`.
 * POSTs `{ type: 'ai-agent', capabilities, endpoint }` to
 * `{registryUrl}/plugins/register`, retrying on failure up to
 * `maxAttempts` times with a fixed delay between attempts.
 */
export async function registerAgentPlugin(
  registryUrl: string,
  metadata: Omit<AgentPluginMetadata, "type">,
  options: RegisterAgentPluginOptions = {},
): Promise<void> {
  const { maxAttempts = 3, retryDelayMs = 200, fetchImpl = fetch } = options;

  const url = `${registryUrl.replace(/\/+$/, "")}/plugins/register`;
  const body: AgentPluginMetadata = { type: "ai-agent", ...metadata };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return;
      }

      lastError = new AgentRegistrationError(
        `Registry responded with status ${response.status} for ${url}`,
      );
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  throw new AgentRegistrationError(
    `Failed to register AI agent plugin with registry at ${url} after ${maxAttempts} attempt(s)`,
    lastError,
  );
}
