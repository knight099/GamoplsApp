import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed internal tenant-scope header (suggestions.md S-1).
 *
 * The BFF gateway (apps/web/lib/gateway-proxy.ts) verifies the session JWT
 * and then mints this header on every request it forwards to
 * services/board|chat|map. Those services take org_id/fleet_id ONLY from
 * this header — never from query params or request bodies — so neither a
 * browser (spoofed body/query) nor a direct network peer (no secret, so no
 * valid signature) can act in another tenant's scope.
 *
 * Format:
 *   base64url(JSON{org_id, fleet_id, exp}) + "." + base64url(HMAC-SHA256(secret, payload))
 *
 * The token is per-request and short-lived (default 120s), which bounds
 * replay by anyone who can already read internal traffic (TLS on internal
 * hops is tracked separately, suggestions.md S-10).
 */

export const SCOPE_HEADER_NAME = "x-gamopls-scope";

/** Dev-only fallback so `pnpm start:all` works with no env setup. */
export const DEV_SCOPE_SECRET_FALLBACK = "dev-only-internal-scope-secret";

const DEFAULT_TTL_SECONDS = 120;

export interface TenantScope {
  org_id: string;
  fleet_id: string;
}

export class ScopeVerificationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ScopeVerificationError";
  }
}

function resolveScopeSecret(explicit?: string): string {
  const secret = explicit ?? process.env.INTERNAL_SCOPE_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INTERNAL_SCOPE_SECRET is not set. It must be configured in production (see .env.example) or passed as { secret } explicitly.",
    );
  }
  return DEV_SCOPE_SECRET_FALLBACK;
}

function hmac(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export interface SignScopeHeaderOptions {
  /** Overrides `process.env.INTERNAL_SCOPE_SECRET`. */
  secret?: string;
  /** Token lifetime in seconds. Default 120. */
  ttlSeconds?: number;
  /** Unix seconds "now" — injectable for tests. Default `Date.now()/1000`. */
  now?: number;
}

export function signScopeHeader(
  scope: TenantScope,
  options: SignScopeHeaderOptions = {},
): string {
  const secret = resolveScopeSecret(options.secret);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const exp = now + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload = Buffer.from(
    JSON.stringify({ org_id: scope.org_id, fleet_id: scope.fleet_id, exp }),
  ).toString("base64url");
  const signature = hmac(secret, payload).toString("base64url");
  return `${payload}.${signature}`;
}

export interface VerifyScopeHeaderOptions {
  /** Overrides `process.env.INTERNAL_SCOPE_SECRET`. */
  secret?: string;
  /** Unix seconds "now" — injectable for tests. Default `Date.now()/1000`. */
  now?: number;
}

/**
 * Verifies a scope header value and returns the tenant scope it carries.
 * Accepts the raw Fastify/Node header value (string | string[] | undefined).
 * Throws `ScopeVerificationError` on any missing/malformed/tampered/expired
 * token — callers should map every thrown case to a 401.
 */
export function verifyScopeHeader(
  value: string | string[] | undefined,
  options: VerifyScopeHeaderOptions = {},
): TenantScope {
  const secret = resolveScopeSecret(options.secret);
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new ScopeVerificationError("scope header is missing");

  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ScopeVerificationError("scope header is malformed");
  }
  const [payload, signature] = parts;

  const expected = hmac(secret, payload);
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ScopeVerificationError("scope header signature is invalid");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (err) {
    throw new ScopeVerificationError("scope header payload is not valid JSON", err);
  }
  const claims = parsed as { org_id?: unknown; fleet_id?: unknown; exp?: unknown };
  if (
    typeof claims.org_id !== "string" ||
    claims.org_id.length === 0 ||
    typeof claims.fleet_id !== "string" ||
    claims.fleet_id.length === 0 ||
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp)
  ) {
    throw new ScopeVerificationError("scope header payload is missing required claims");
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (now > claims.exp) throw new ScopeVerificationError("scope header has expired");

  return { org_id: claims.org_id, fleet_id: claims.fleet_id };
}
