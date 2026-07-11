# Tenancy Hardening (S-1 / S-3 / S-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the three verified critical tenancy vulnerabilities from `suggestions.md` (NOW item 1): body-trusted tenancy in board/chat, cross-tenant reads + IDOR in map, and the broken geofence-creation UI — by introducing a gateway-signed internal scope header that `board`/`chat`/`map` treat as the *only* source of tenant identity.

**Architecture:** The BFF gateway (`apps/web/lib/gateway-proxy.ts`) already verifies the session JWT; it additionally mints a short-lived HMAC-signed header `x-gamopls-scope` = `base64url({org_id, fleet_id, exp}) + "." + base64url(HMAC-SHA256)` on every forwarded request, keyed by a shared internal secret (`INTERNAL_SCOPE_SECRET`). `board`, `chat`, and `map` verify that header per request and take tenancy exclusively from it — query params and body fields are no longer consulted for scope. `hub`/`fleet` keep the query-param pattern for now (they're already gateway-safe); the gateway keeps injecting query params so they're untouched. All `org_id`/`fleet_id` fields are deleted from body schemas, which simultaneously fixes the geofence-creation 400 and the (newly discovered) board mission/task-creation 400 — the UI already sends tenancy-free bodies.

**Tech Stack:** Node `crypto` (HMAC-SHA256 + `timingSafeEqual`, zero new deps) in `packages/auth`; Fastify 5 + zod in services; vitest.

## Global Constraints

- Never import a concrete Asset Type Plugin into a module service (CLAUDE.md). `@gamopls/auth` is a shared `packages/*` lib — services MAY depend on it.
- Cross-module domain propagation stays on NATS; nothing here adds service-to-service calls.
- Header name is exactly `x-gamopls-scope` (lowercase). Env var is exactly `INTERNAL_SCOPE_SECRET`.
- Dev fallback secret is exactly `"dev-only-internal-scope-secret"`; production (`NODE_ENV === "production"`) with no explicit/env secret must **throw**.
- Scope token TTL default: **120 seconds**.
- Cross-tenant access to an individual resource returns **404** (never reveal existence). Missing/invalid/expired scope header returns **401**. Path-vs-scope fleet mismatch on the positions collection returns **403**.
- NATS-side consumers (`alert-bridge`, `task-suggested-handler`, geofence detector, position cache writers) take tenancy from validated events — they are NOT touched.
- `/health` routes and board's `/agents/register` stay unguarded (no tenant data; service-registration hardening is a separate roadmap item).
- Test-run gotcha (repo history): `pnpm --filter <pkg> test -- <pattern>` does NOT filter; use `cd <pkg> && npx vitest run <file>`.
- Commit after every task, message style: `fix(scope): ...` seen in `git log`.

---

### Task 1: `packages/auth` — signed tenant-scope header primitives

**Files:**
- Create: `packages/auth/src/scope-header.ts`
- Create: `packages/auth/src/__tests__/scope-header.test.ts`
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: nothing (leaf task).
- Produces (used by Tasks 2–6):
  - `SCOPE_HEADER_NAME: "x-gamopls-scope"`
  - `interface TenantScope { org_id: string; fleet_id: string }`
  - `class ScopeVerificationError extends Error`
  - `signScopeHeader(scope: TenantScope, options?: { secret?: string; ttlSeconds?: number; now?: number }): string`
  - `verifyScopeHeader(value: string | string[] | undefined, options?: { secret?: string; now?: number }): TenantScope` — throws `ScopeVerificationError`
  - `DEV_SCOPE_SECRET_FALLBACK: "dev-only-internal-scope-secret"`

- [ ] **Step 1: Write the failing tests**

`packages/auth/src/__tests__/scope-header.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEV_SCOPE_SECRET_FALLBACK,
  SCOPE_HEADER_NAME,
  ScopeVerificationError,
  signScopeHeader,
  verifyScopeHeader,
} from "../scope-header.js";

const SECRET = "test-internal-secret";
const SCOPE = { org_id: "org-1", fleet_id: "fleet-1" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signScopeHeader / verifyScopeHeader", () => {
  it("round-trips a scope", () => {
    const header = signScopeHeader(SCOPE, { secret: SECRET });
    expect(verifyScopeHeader(header, { secret: SECRET })).toEqual(SCOPE);
  });

  it("exports the canonical header name", () => {
    expect(SCOPE_HEADER_NAME).toBe("x-gamopls-scope");
  });

  it("rejects a missing header", () => {
    expect(() => verifyScopeHeader(undefined, { secret: SECRET })).toThrow(ScopeVerificationError);
    expect(() => verifyScopeHeader("", { secret: SECRET })).toThrow(ScopeVerificationError);
  });

  it("accepts the first value of a multi-value header", () => {
    const header = signScopeHeader(SCOPE, { secret: SECRET });
    expect(verifyScopeHeader([header, "junk"], { secret: SECRET })).toEqual(SCOPE);
  });

  it("rejects a tampered payload", () => {
    const header = signScopeHeader(SCOPE, { secret: SECRET });
    const [, sig] = header.split(".");
    const forged =
      Buffer.from(JSON.stringify({ org_id: "org-EVIL", fleet_id: "fleet-1", exp: 9999999999 })).toString("base64url") +
      "." +
      sig;
    expect(() => verifyScopeHeader(forged, { secret: SECRET })).toThrow(ScopeVerificationError);
  });

  it("rejects a signature minted with a different secret", () => {
    const header = signScopeHeader(SCOPE, { secret: "other-secret" });
    expect(() => verifyScopeHeader(header, { secret: SECRET })).toThrow(ScopeVerificationError);
  });

  it("rejects an expired token", () => {
    const header = signScopeHeader(SCOPE, { secret: SECRET, ttlSeconds: 120, now: 1_000_000 });
    expect(() => verifyScopeHeader(header, { secret: SECRET, now: 1_000_121 })).toThrow(
      ScopeVerificationError,
    );
    // still valid just inside the window
    expect(verifyScopeHeader(header, { secret: SECRET, now: 1_000_119 })).toEqual(SCOPE);
  });

  it("rejects structurally invalid tokens", () => {
    for (const bad of ["nodots", "a.b.c", "!!!.###", Buffer.from("{}").toString("base64url") + "."]) {
      expect(() => verifyScopeHeader(bad, { secret: SECRET })).toThrow(ScopeVerificationError);
    }
  });

  it("rejects payloads with empty org_id/fleet_id", () => {
    const header = signScopeHeader({ org_id: "", fleet_id: "fleet-1" } as never, { secret: SECRET });
    expect(() => verifyScopeHeader(header, { secret: SECRET })).toThrow(ScopeVerificationError);
  });

  it("falls back to the dev secret outside production when no secret is configured", () => {
    vi.stubEnv("INTERNAL_SCOPE_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    const header = signScopeHeader(SCOPE);
    expect(verifyScopeHeader(header, { secret: DEV_SCOPE_SECRET_FALLBACK })).toEqual(SCOPE);
  });

  it("throws in production when no secret is configured", () => {
    vi.stubEnv("INTERNAL_SCOPE_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signScopeHeader(SCOPE)).toThrow(/INTERNAL_SCOPE_SECRET/);
    expect(() => verifyScopeHeader("x.y")).toThrow(/INTERNAL_SCOPE_SECRET/);
  });

  it("reads INTERNAL_SCOPE_SECRET from the environment", () => {
    vi.stubEnv("INTERNAL_SCOPE_SECRET", "env-secret");
    const header = signScopeHeader(SCOPE);
    expect(verifyScopeHeader(header)).toEqual(SCOPE);
    expect(() => verifyScopeHeader(header, { secret: "wrong" })).toThrow(ScopeVerificationError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/auth && npx vitest run src/__tests__/scope-header.test.ts`
Expected: FAIL — cannot resolve `../scope-header.js`.

- [ ] **Step 3: Implement `scope-header.ts`**

`packages/auth/src/scope-header.ts`:

```ts
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
 * Format: base64url(JSON{org_id, fleet_id, exp}) + "." + base64url(HMAC-SHA256(secret, payload))
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

export function signScopeHeader(scope: TenantScope, options: SignScopeHeaderOptions = {}): string {
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
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch (err) {
    throw new ScopeVerificationError("scope header signature is not base64url", err);
  }
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
```

Append to `packages/auth/src/index.ts`:

```ts
export {
  SCOPE_HEADER_NAME,
  DEV_SCOPE_SECRET_FALLBACK,
  ScopeVerificationError,
  signScopeHeader,
  verifyScopeHeader,
} from "./scope-header.js";
export type {
  TenantScope,
  SignScopeHeaderOptions,
  VerifyScopeHeaderOptions,
} from "./scope-header.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/auth && npx vitest run`
Expected: PASS (new file + existing jwt/session-cookie tests).

- [ ] **Step 5: Build the package (services consume `dist/`)**

Run: `pnpm --filter @gamopls/auth build`
Expected: tsup completes with dts.

- [ ] **Step 6: Commit**

```bash
git add packages/auth
git commit -m "feat(auth): signed internal tenant-scope header (sign/verify, S-1 primitive)"
```

---

### Task 2: Gateway mints the scope header; strips inbound forgeries

**Files:**
- Modify: `apps/web/lib/gateway-proxy.ts`
- Modify: `apps/web/lib/__tests__/gateway-proxy.test.ts`
- Modify: `.env.example`
- Modify: `docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md` (~lines 165–175, the gateway trust-boundary section)

**Interfaces:**
- Consumes: `SCOPE_HEADER_NAME`, `signScopeHeader` from `@gamopls/auth` (Task 1).
- Produces: every proxied request carries a valid `x-gamopls-scope` header; any client-supplied `x-gamopls-scope` is dropped before signing. Query-param injection (`org_id`/`fleet_id`) is **unchanged** (hub/fleet still read it).

- [ ] **Step 1: Write the failing tests**

Open `apps/web/lib/__tests__/gateway-proxy.test.ts`, find how it stubs `fetch` and env (it already stubs `JWT_SECRET` and asserts on the forwarded URL/headers). Add to the existing describe block — adapting the existing helper names for issuing a session cookie and capturing the upstream request:

```ts
import { SCOPE_HEADER_NAME, verifyScopeHeader } from "@gamopls/auth";

it("attaches a signed x-gamopls-scope header derived from the JWT", async () => {
  // use the file's existing helpers: issue a JWT for { org_id: "org-1", fleet_id: "fleet-1" },
  // build a NextRequest with the session cookie, invoke the handler, capture fetch args.
  const upstream = await captureUpstreamRequest(); // per existing test conventions
  const scope = verifyScopeHeader(upstream.headers.get(SCOPE_HEADER_NAME) ?? undefined, {
    secret: process.env.INTERNAL_SCOPE_SECRET,
  });
  expect(scope).toEqual({ org_id: "org-1", fleet_id: "fleet-1" });
});

it("discards a client-supplied x-gamopls-scope header instead of forwarding it", async () => {
  // same as above but the incoming NextRequest carries
  // headers: { [SCOPE_HEADER_NAME]: "attacker.forged" }
  const upstream = await captureUpstreamRequest({ [SCOPE_HEADER_NAME]: "attacker.forged" });
  const forwarded = upstream.headers.get(SCOPE_HEADER_NAME);
  expect(forwarded).not.toBe("attacker.forged");
  expect(() =>
    verifyScopeHeader(forwarded ?? undefined, { secret: process.env.INTERNAL_SCOPE_SECRET }),
  ).not.toThrow();
});
```

Also stub `INTERNAL_SCOPE_SECRET` alongside the existing `JWT_SECRET` stub (e.g. `vi.stubEnv("INTERNAL_SCOPE_SECRET", "gw-test-secret")`).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/web && npx vitest run lib/__tests__/gateway-proxy.test.ts`
Expected: the two new tests FAIL (header absent / forged header forwarded).

- [ ] **Step 3: Implement gateway changes**

In `apps/web/lib/gateway-proxy.ts`:

1. Extend the import: `import { verifyJwt, JwtVerificationError, SESSION_COOKIE_NAME, SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";`
2. Add the scope header to the strip list so a client can never smuggle one through:

```ts
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "transfer-encoding",
  SCOPE_HEADER_NAME, // client-supplied scope is always discarded; the gateway mints its own below
]);
```

3. In `gatewayHandler`, after building headers and before `fetch`:

```ts
const headers = forwardableRequestHeaders(request);
headers.set(
  SCOPE_HEADER_NAME,
  signScopeHeader({ org_id: claims.org_id, fleet_id: claims.fleet_id }),
);

const upstreamResponse = await fetch(upstreamUrl, {
  method: request.method,
  headers,
  ...
```

4. Update the module doc comment: point 3 becomes — injects tenancy two ways: (a) the signed `x-gamopls-scope` header (authoritative; board/chat/map verify it and read scope ONLY from it), (b) `org_id`/`fleet_id` query params (transitional, consumed by hub/fleet until they migrate to the header). Delete the sentence telling services to treat query params as authoritative.

- [ ] **Step 4: Run the web test suite**

Run: `cd apps/web && npx vitest run lib/__tests__/gateway-proxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the env var**

`.env.example`, under the `JWT_SECRET` line:

```
# Shared secret for the gateway-signed internal tenant-scope header
# (x-gamopls-scope). Services/board|chat|map verify it. Falls back to a
# dev-only constant outside production; REQUIRED in production.
INTERNAL_SCOPE_SECRET=changeme-dev-only-generate-a-real-secret
```

In `docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md`, update the gateway trust-boundary bullets (~168–169): the gateway now (a) overwrites `org_id`/`fleet_id` query params AND (b) mints a signed short-TTL `x-gamopls-scope` header; `board`/`chat`/`map` verify the header and take scope only from it (a direct network peer without `INTERNAL_SCOPE_SECRET` cannot forge it), while `hub`/`fleet` still consume the injected query params pending migration.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib .env.example docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md
git commit -m "feat(gateway): mint signed x-gamopls-scope header, strip client-supplied copies (S-1)"
```

---

### Task 3: `services/board` reads tenancy only from the scope header

**Files:**
- Modify: `services/board/src/build-app.ts`
- Modify: `services/board/src/types.ts` (create schemas lose tenancy fields)
- Modify: `services/board/src/__tests__/build-app.test.ts`
- Check (adjust only if it references the create schemas): `services/board/src/__tests__/schema-agnostic.test.ts`
- Modify: `services/board/package.json` (add `"@gamopls/auth": "workspace:*"` to `dependencies`)

**Interfaces:**
- Consumes: `SCOPE_HEADER_NAME`, `verifyScopeHeader`, `ScopeVerificationError`, `signScopeHeader` (tests), `TenantScope` from `@gamopls/auth`.
- Produces:
  - `BuildAppOptions.scopeSecret?: string` (defaults to env/dev fallback via `verifyScopeHeader`).
  - `createMissionBodySchema` / `createTaskBodySchema` (no `org_id`/`fleet_id`); repo-facing types keep tenancy: `type CreateMissionInput = z.infer<typeof createMissionBodySchema> & TenantScope` (same for tasks) so `BoardRepository` and `task-suggested-handler.ts` compile unchanged.
  - Every mission/task route: 401 `{ error: "missing or invalid tenant scope" }` without a valid header.

- [ ] **Step 1: Add the dependency**

In `services/board/package.json` `dependencies`, add `"@gamopls/auth": "workspace:*"`, then run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

In `services/board/src/__tests__/build-app.test.ts`, add at the top:

```ts
import { SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";

const SCOPE_SECRET = "board-test-secret";
const scopeHeaders = (org_id = "org-1", fleet_id = "fleet-1") => ({
  [SCOPE_HEADER_NAME]: signScopeHeader({ org_id, fleet_id }, { secret: SCOPE_SECRET }),
});
```

Every `buildApp(...)` call in this file gains `scopeSecret: SCOPE_SECRET` in its options. New tests:

```ts
describe("tenant scope enforcement (S-1)", () => {
  it("rejects requests without a scope header with 401", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const res = await app.inject({ method: "GET", url: "/missions" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a scope header signed with the wrong secret", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const res = await app.inject({
      method: "GET",
      url: "/missions",
      headers: { [SCOPE_HEADER_NAME]: signScopeHeader({ org_id: "org-1", fleet_id: "fleet-1" }, { secret: "evil" }) },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates missions in the header scope and ignores spoofed body tenancy", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const created = await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Patrol", org_id: "org-EVIL", fleet_id: "fleet-EVIL" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });
  });

  it("ignores query-param tenancy in favor of the header", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    await app.inject({
      method: "POST", url: "/missions", headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Mine" },
    });
    const crossRead = await app.inject({
      method: "GET",
      url: "/missions?org_id=org-1&fleet_id=fleet-1", // attacker-style query
      headers: scopeHeaders("org-2", "fleet-2"),
    });
    expect(crossRead.statusCode).toBe(200);
    expect(crossRead.json().missions).toEqual([]);
  });

  it("hides another org's mission behind 404 on by-id routes", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const created = await app.inject({
      method: "POST", url: "/missions", headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Secret" },
    });
    const id = created.json().id;
    for (const [method, url] of [
      ["GET", `/missions/${id}`],
      ["PATCH", `/missions/${id}`],
      ["DELETE", `/missions/${id}`],
    ] as const) {
      const res = await app.inject({
        method, url, headers: scopeHeaders("org-2", "fleet-2"),
        ...(method === "PATCH" ? { payload: { title: "stolen" } } : {}),
      });
      expect(res.statusCode).toBe(404);
    }
  });
});
```

Then convert every existing test in the file mechanically:
- requests that passed `?org_id=X&fleet_id=Y` → drop those query params, add `headers: scopeHeaders("X", "Y")`;
- create payloads that included `org_id`/`fleet_id` → remove those two body fields, keep the rest;
- assertions on created objects keep expecting `org_id`/`fleet_id` (now sourced from the header).

Locate them all: `grep -n "org_id" services/board/src/__tests__/build-app.test.ts`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/board && npx vitest run src/__tests__/build-app.test.ts`
Expected: FAIL (401s absent, schemas still demand body tenancy).

- [ ] **Step 4: Implement**

`services/board/src/types.ts` — replace the two create schemas:

```ts
/** Request-body schema: tenancy comes from the gateway-signed scope header
 * (x-gamopls-scope), NEVER from the body (suggestions.md S-1). */
export const createMissionBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  status: missionStatusSchema.default("active"),
});
export type CreateMissionBody = z.infer<typeof createMissionBodySchema>;
/** Repo-facing input: body plus the header-derived tenant scope. */
export type CreateMissionInput = CreateMissionBody & { org_id: string; fleet_id: string };

export const createTaskBodySchema = z.object({
  mission_id: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
  status: taskStatusSchema.default("open"),
  asset_id: z.string().min(1).nullable().default(null),
});
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;
export type CreateTaskInput = CreateTaskBody & { org_id: string; fleet_id: string };
```

(`CreateMissionInput`/`CreateTaskInput` keep their names and shapes, so `repository.ts`, both repository implementations, and `task-suggested-handler.ts` need no changes.)

`services/board/src/build-app.ts`:

1. Imports: replace `createMissionInputSchema`/`createTaskInputSchema` with `createMissionBodySchema`/`createTaskBodySchema`; add
   `import { SCOPE_HEADER_NAME, ScopeVerificationError, verifyScopeHeader, type TenantScope } from "@gamopls/auth";`
   and `import type { FastifyReply, FastifyRequest } from "fastify";`
2. `BuildAppOptions` gains: `/** Overrides INTERNAL_SCOPE_SECRET for tests. */ scopeSecret?: string;`
3. Replace `tenancyQuerySchema` with:

```ts
function makeRequireScope(scopeSecret?: string) {
  return function requireScope(request: FastifyRequest, reply: FastifyReply): TenantScope | null {
    try {
      return verifyScopeHeader(request.headers[SCOPE_HEADER_NAME], { secret: scopeSecret });
    } catch (err) {
      if (err instanceof ScopeVerificationError) {
        reply.status(401).send({ error: "missing or invalid tenant scope" });
        return null;
      }
      throw err;
    }
  };
}
```

In `buildApp`: `const requireScope = makeRequireScope(options.scopeSecret);`

4. Every route that called `tenancyQuerySchema(request.query)` becomes:

```ts
const scope = requireScope(request, reply);
if (!scope) return reply;
```

with `tenancy.org_id`/`tenancy.fleet_id` renamed to `scope.org_id`/`scope.fleet_id`.

5. The two create routes source tenancy from scope:

```ts
app.post("/missions", async (request, reply) => {
  const scope = requireScope(request, reply);
  if (!scope) return reply;
  const parsed = createMissionBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "invalid mission payload", details: parsed.error.flatten() });
  }
  const mission = await repo.createMission({ org_id: scope.org_id, fleet_id: scope.fleet_id, ...parsed.data });
  return reply.status(201).send(mission);
});
```

(identically for `POST /tasks` with `createTaskBodySchema`/`createTask`).

6. `/health` and `/agents/register` stay as they are, with a one-line comment on `/agents/register`: `// service-to-service registration, no tenant data; hardening tracked separately (suggestions.md S-10)`.

- [ ] **Step 5: Run the board suite**

Run: `cd services/board && npx vitest run`
Expected: PASS (including `schema-agnostic.test.ts` — if it imported the old schema names, update the imports to the new `*BodySchema` names; the field-denylist logic is unaffected).

- [ ] **Step 6: Commit**

```bash
git add services/board pnpm-lock.yaml
git commit -m "fix(board): take tenancy from signed scope header only; drop org/fleet from create bodies (S-1)"
```

---

### Task 4: `services/chat` — header scope + by-id tenancy enforcement (IDOR fix)

**Files:**
- Modify: `services/chat/src/build-app.ts`
- Modify: `services/chat/src/schemas.ts`
- Modify: `services/chat/src/__tests__/build-app.test.ts`
- Modify: `services/chat/package.json` (add `"@gamopls/auth": "workspace:*"`)

**Interfaces:**
- Consumes: same `@gamopls/auth` exports as Task 3.
- Produces: `BuildAppOptions.scopeSecret?: string`; `createChannelBodySchema` without tenancy; all channel/message routes 401 without a header and 404 on org mismatch. Chat enforces **org-level** scope (`channel.org_id === scope.org_id`) because listing is already org-wide (`channels.list(orgId)`); fleet-level partitioning of chat is a product decision left as-is.

- [ ] **Step 1: Add the dependency**

`services/chat/package.json` dependencies += `"@gamopls/auth": "workspace:*"`; `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Same header helper as Task 3 (`SCOPE_SECRET = "chat-test-secret"`, `scopeHeaders(org, fleet)`), `buildApp({ ..., scopeSecret: SCOPE_SECRET })`. Convert existing tests: creates lose body `org_id`/`fleet_id` and gain headers; list requests drop `?org_id=` and gain headers. New coverage:

```ts
describe("tenant scope enforcement (S-1, chat IDOR)", () => {
  async function createChannel(app: FastifyInstance, org = "org-1", fleet = "fleet-1") {
    const res = await app.inject({
      method: "POST", url: "/channels", headers: scopeHeaders(org, fleet),
      payload: { mission_id: "mission-1", name: "Ops" },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("401s every channel/message route without a scope header", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    for (const [method, url] of [
      ["POST", "/channels"], ["GET", "/channels"], ["GET", "/channels/c1"],
      ["PATCH", "/channels/c1"], ["DELETE", "/channels/c1"],
      ["POST", "/channels/c1/messages"], ["GET", "/channels/c1/messages"],
      ["GET", "/messages/m1"], ["PATCH", "/messages/m1"], ["DELETE", "/messages/m1"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("creates channels in the header scope, ignoring spoofed body tenancy", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const res = await app.inject({
      method: "POST", url: "/channels", headers: scopeHeaders("org-1", "fleet-1"),
      payload: { mission_id: "m-1", name: "Ops", org_id: "org-EVIL", fleet_id: "fleet-EVIL" },
    });
    expect(res.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });
  });

  it("hides another org's channel and its messages behind 404", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const channel = await createChannel(app, "org-1");
    for (const [method, url, payload] of [
      ["GET", `/channels/${channel.id}`, undefined],
      ["PATCH", `/channels/${channel.id}`, { name: "hijack" }],
      ["DELETE", `/channels/${channel.id}`, undefined],
      ["GET", `/channels/${channel.id}/messages`, undefined],
      ["POST", `/channels/${channel.id}/messages`, { senderId: "u", body: "hi" }],
    ] as const) {
      const res = await app.inject({ method, url, payload, headers: scopeHeaders("org-2", "fleet-2") });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it("hides another org's message behind 404 on by-id message routes", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    const channel = await createChannel(app, "org-1");
    const msg = await app.inject({
      method: "POST", url: `/channels/${channel.id}/messages`,
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { senderId: "u1", body: "secret" },
    });
    const id = msg.json().id;
    for (const [method, url, payload] of [
      ["GET", `/messages/${id}`, undefined],
      ["PATCH", `/messages/${id}`, { body: "tampered" }],
      ["DELETE", `/messages/${id}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, payload, headers: scopeHeaders("org-2", "fleet-2") });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it("lists only the caller org's channels regardless of query params", async () => {
    const app = buildApp({ scopeSecret: SCOPE_SECRET });
    await createChannel(app, "org-1");
    const res = await app.inject({
      method: "GET", url: "/channels?org_id=org-1", headers: scopeHeaders("org-2", "fleet-2"),
    });
    expect(res.json().channels).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/chat && npx vitest run src/__tests__/build-app.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

`services/chat/src/schemas.ts`: `createChannelBodySchema` becomes

```ts
/** Tenancy comes from the gateway-signed scope header, never the body (S-1). */
export const createChannelBodySchema = z.object({
  mission_id: z.string().min(1),
  name: z.string().min(1),
});
```

`services/chat/src/build-app.ts`:
1. Add the same imports + `makeRequireScope` helper + `BuildAppOptions.scopeSecret?: string` as Task 3 (copy the helper verbatim; C-5 consolidation is a separate roadmap item).
2. `POST /channels`: `scope` first; `channels.create({ org_id: scope.org_id, fleet_id: scope.fleet_id, ...parsed.data })`.
3. `GET /channels`: `scope` first; keep `mission_id` query filter; call `channels.listByMission(scope.org_id, missionId)` / `channels.list(scope.org_id)`. Delete the `org_id` query handling.
4. `GET/PATCH/DELETE /channels/:id`: `scope` first, load channel, then

```ts
if (!channel || channel.org_id !== scope.org_id) {
  return reply.status(404).send({ error: "channel not found" });
}
```

(for PATCH/DELETE do the lookup with `channels.findById(id)` **before** mutating; DELETE then calls `channels.delete(id)`, PATCH calls `channels.update(id, parsed.data)`).
5. Message routes: `POST/GET /channels/:channelId/messages` — after loading the channel, apply the same org check (404 on mismatch). `GET/PATCH/DELETE /messages/:id` — load via `messages.findById(id)`, 404 unless `message.org_id === scope.org_id`, then proceed.

- [ ] **Step 5: Run the chat suite**

Run: `cd services/chat && npx vitest run`
Expected: PASS (alert-bridge/repository tests untouched — they don't go through HTTP).

- [ ] **Step 6: Commit**

```bash
git add services/chat pnpm-lock.yaml
git commit -m "fix(chat): scope header enforcement + close by-id cross-tenant IDOR (S-1)"
```

---

### Task 5: `services/map` REST — geofence tenancy, positions path check, metadata via scope

**Files:**
- Modify: `services/map/src/build-app.ts`
- Modify: `services/map/src/geofence/types.ts`
- Modify: `services/map/src/geofence/geofence-store.ts` (list filter gains `org_id`)
- Modify: `services/map/src/server.ts` (buildApp call site if signature changes)
- Modify: `services/map/src/__tests__/build-app.test.ts`
- Modify: `services/map/package.json` (add `"@gamopls/auth": "workspace:*"`)

**Interfaces:**
- Consumes: `@gamopls/auth` exports (Task 1).
- Produces:
  - `buildApp(mapService: MapService, options?: { scopeSecret?: string })`
  - `geofenceBodySchema` (asset_id/name/centerLat/centerLng/radiusMeters — no tenancy); `geofenceUpdateSchema = geofenceBodySchema.partial()` (tenancy can no longer be patched); `type GeofenceInput = GeofenceBody & { org_id: string; fleet_id: string }` so `GeofenceStore`/detector compile unchanged.
  - `GeofenceStore.list(filter?: { org_id?: string; fleet_id?: string; asset_id?: string })`
  - `GET /fleets/:fleetId/positions` → 403 `{ error: "fleet scope mismatch" }` when `params.fleetId !== scope.fleet_id`.
  - Geofence by-id routes → 404 when stored `org_id`/`fleet_id` ≠ scope.

- [ ] **Step 1: Add the dependency**

`services/map/package.json` dependencies += `"@gamopls/auth": "workspace:*"`; `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Same helper block (`SCOPE_SECRET = "map-test-secret"`); every `buildApp(service)` in `build-app.test.ts` becomes `buildApp(service, { scopeSecret: SCOPE_SECRET })`; existing requests gain `headers: scopeHeaders(...)`; geofence create payloads lose `org_id`/`fleet_id`. New coverage:

```ts
describe("tenant scope enforcement (S-1/S-3/S-4)", () => {
  const GEOFENCE_BODY = { asset_id: "asset-1", name: "Depot", centerLat: 13.08, centerLng: 80.27, radiusMeters: 500 };

  it("401s geofence and position routes without a scope header", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    for (const [method, url] of [
      ["POST", "/geofences"], ["GET", "/geofences"], ["GET", "/geofences/g1"],
      ["PUT", "/geofences/g1"], ["DELETE", "/geofences/g1"],
      ["PUT", "/assets/a1/metadata"], ["GET", "/fleets/fleet-1/positions"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("creates a geofence from a tenancy-free body under the header scope (S-4 regression)", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    // exactly the body GeofencePanel sends after Task 7
    const res = await app.inject({
      method: "POST", url: "/geofences", headers: scopeHeaders("org-1", "fleet-1"),
      payload: GEOFENCE_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1", name: "Depot" });
  });

  it("hides another tenant's geofence behind 404 (S-3 IDOR)", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    const created = await app.inject({
      method: "POST", url: "/geofences", headers: scopeHeaders("org-1", "fleet-1"), payload: GEOFENCE_BODY,
    });
    const id = created.json().id;
    for (const [method, url, payload] of [
      ["GET", `/geofences/${id}`, undefined],
      ["PUT", `/geofences/${id}`, { name: "stolen" }],
      ["DELETE", `/geofences/${id}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, payload, headers: scopeHeaders("org-2", "fleet-2") });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // still intact for the owner
    const still = await app.inject({ method: "GET", url: `/geofences/${id}`, headers: scopeHeaders("org-1", "fleet-1") });
    expect(still.statusCode).toBe(200);
  });

  it("lists only the scope tenant's geofences and ignores query fleet_id", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    await app.inject({ method: "POST", url: "/geofences", headers: scopeHeaders("org-1", "fleet-1"), payload: GEOFENCE_BODY });
    const res = await app.inject({
      method: "GET", url: "/geofences?fleet_id=fleet-1", headers: scopeHeaders("org-2", "fleet-2"),
    });
    expect(res.json().geofences).toEqual([]);
  });

  it("rejects update payloads that try to move a geofence across tenants", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    const created = await app.inject({
      method: "POST", url: "/geofences", headers: scopeHeaders("org-1", "fleet-1"), payload: GEOFENCE_BODY,
    });
    const res = await app.inject({
      method: "PUT", url: `/geofences/${created.json().id}`,
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { org_id: "org-2", name: "renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ org_id: "org-1", name: "renamed" }); // zod strips the unknown key
  });

  it("403s a positions read for a fleet outside the caller's scope (S-3)", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    const res = await app.inject({
      method: "GET", url: "/fleets/fleet-OTHER/positions", headers: scopeHeaders("org-1", "fleet-1"),
    });
    expect(res.statusCode).toBe(403);
    const ok = await app.inject({
      method: "GET", url: "/fleets/fleet-1/positions", headers: scopeHeaders("org-1", "fleet-1"),
    });
    expect(ok.statusCode).toBe(200);
  });

  it("stores asset metadata under the header scope, not body tenancy", async () => {
    const app = await buildApp(service, { scopeSecret: SCOPE_SECRET });
    const res = await app.inject({
      method: "PUT", url: "/assets/asset-9/metadata", headers: scopeHeaders("org-1", "fleet-1"),
      payload: { type: "vehicle", mapIcon: "truck", displayLabel: "T-9", org_id: "org-EVIL", fleet_id: "fleet-EVIL" },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

(Adapt `service` construction to the file's existing fixture setup — it already builds a `MapService` with in-memory cache/store.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/map && npx vitest run src/__tests__/build-app.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

`services/map/src/geofence/types.ts` — replace the input schema block:

```ts
/** Request-body schema: tenancy comes from the gateway-signed scope header
 * (x-gamopls-scope), never from the body (suggestions.md S-1/S-4). */
export const geofenceBodySchema = z.object({
  asset_id: z.string().min(1),
  name: z.string().min(1),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMeters: z.number().positive(),
});
export type GeofenceBody = z.infer<typeof geofenceBodySchema>;

/** Store-facing input: body plus the header-derived tenant scope. */
export type GeofenceInput = GeofenceBody & { org_id: string; fleet_id: string };

export interface Geofence extends GeofenceInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Update payload: geometry/name/asset only — tenancy is immutable. */
export const geofenceUpdateSchema = geofenceBodySchema.partial();
export type GeofenceUpdate = z.infer<typeof geofenceUpdateSchema>;
```

(The old `geofenceInputSchema` export disappears; fix any import of it — `grep -rn "geofenceInputSchema" services/map/src`.)

`services/map/src/geofence/geofence-store.ts` — extend the list filter:

```ts
list(filter?: { org_id?: string; fleet_id?: string; asset_id?: string }): Geofence[] {
  const all = [...this.geofences.values()];
  return all.filter(
    (g) =>
      (filter?.org_id === undefined || g.org_id === filter.org_id) &&
      (filter?.fleet_id === undefined || g.fleet_id === filter.fleet_id) &&
      (filter?.asset_id === undefined || g.asset_id === filter.asset_id),
  );
}
```

(match the existing body's style — it already filters on fleet_id/asset_id; add the org clause).

`services/map/src/build-app.ts`:
1. Imports: `geofenceBodySchema`/`geofenceUpdateSchema`; `@gamopls/auth` scope imports; `FastifyReply`/`FastifyRequest` types; add the same `makeRequireScope` helper as Task 3.
2. Signature: `export async function buildApp(mapService: MapService, options: { scopeSecret?: string } = {}): Promise<FastifyInstance>` and `const requireScope = makeRequireScope(options.scopeSecret);`. Update `services/map/src/server.ts`'s call → `buildApp(mapService)` still compiles (options optional).
3. `assetMetadataSchema`: delete the `org_id`/`fleet_id` checks and returned fields (keep type/mapIcon/displayLabel/pluginMetadata).
4. Routes:

```ts
app.post("/geofences", async (request, reply) => {
  const scope = requireScope(request, reply);
  if (!scope) return reply;
  const parsed = geofenceBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "invalid geofence payload", details: parsed.error.flatten() });
  }
  const geofence = mapService.geofenceStore.create({
    ...parsed.data,
    org_id: scope.org_id,
    fleet_id: scope.fleet_id,
  });
  return reply.status(201).send(geofence);
});

app.get("/geofences", async (request, reply) => {
  const scope = requireScope(request, reply);
  if (!scope) return reply;
  const query = request.query as { asset_id?: string };
  const geofences = mapService.geofenceStore.list({
    org_id: scope.org_id,
    fleet_id: scope.fleet_id,
    asset_id: query.asset_id,
  });
  return reply.status(200).send({ geofences });
});
```

By-id routes share a loader:

```ts
function loadScopedGeofence(id: string, scope: TenantScope) {
  const geofence = mapService.geofenceStore.get(id);
  if (!geofence || geofence.org_id !== scope.org_id || geofence.fleet_id !== scope.fleet_id) {
    return null; // cross-tenant access is indistinguishable from "not found"
  }
  return geofence;
}
```

`GET /geofences/:id`: scope → `loadScopedGeofence` → 404 or 200.
`PUT /geofences/:id`: scope → `loadScopedGeofence` (404) → parse `geofenceUpdateSchema` (400) → `store.update(id, parsed.data)` → 200.
`DELETE /geofences/:id`: scope → `loadScopedGeofence` (404) → `store.delete(id)` → 204.

Metadata:

```ts
app.put("/assets/:assetId/metadata", async (request, reply) => {
  const scope = requireScope(request, reply);
  if (!scope) return reply;
  const { assetId } = request.params as { assetId: string };
  const parsed = assetMetadataSchema.parse(request.body);
  if (!parsed) return reply.status(400).send({ error: "invalid asset metadata payload" });
  const snapshot = await mapService.setAssetMetadata(assetId, scope.org_id, scope.fleet_id, parsed);
  return reply.status(200).send(snapshot);
});
```

Positions:

```ts
app.get("/fleets/:fleetId/positions", async (request, reply) => {
  const scope = requireScope(request, reply);
  if (!scope) return reply;
  const { fleetId } = request.params as { fleetId: string };
  if (fleetId !== scope.fleet_id) {
    return reply.status(403).send({ error: "fleet scope mismatch" });
  }
  const markers = await mapService.getFleetMarkers(fleetId);
  return reply.status(200).send({ fleet_id: fleetId, positions: markers });
});
```

- [ ] **Step 5: Run the map REST suite**

Run: `cd services/map && npx vitest run src/__tests__/build-app.test.ts`
Expected: PASS. (`websocket.test.ts` may now fail — that's Task 6; if so, proceed, don't "fix" it here beyond compilation.)

- [ ] **Step 6: Commit**

```bash
git add services/map pnpm-lock.yaml
git commit -m "fix(map): scope-header tenancy on geofences/positions/metadata; close S-3 IDOR + path-param cross-tenant read"
```

---

### Task 6: `services/map` WebSocket route guard

**Files:**
- Modify: `services/map/src/build-app.ts` (WS handler)
- Modify: `services/map/src/__tests__/websocket.test.ts`

**Interfaces:**
- Consumes: `requireScope` machinery from Task 5 (already in the file), `verifyScopeHeader`.
- Produces: WS upgrade requests without a valid scope header, or for a fleet ≠ scope fleet, are closed with code **1008**. (The endpoint is unused by the web app — polling is used — and is slated for deletion under A-5; until that decision, it must not stay an open cross-tenant leak.)

- [ ] **Step 1: Write the failing tests**

In `services/map/src/__tests__/websocket.test.ts` (which already opens real sockets against `app.listen`), mint headers with the same helper and pass them at connect time (`new WebSocket(url, { headers: scopeHeaders("org-1", "fleet-1") })`). Add:

```ts
it("closes the socket with 1008 when the scope header is missing", async () => {
  const ws = new WebSocket(`${baseUrl}/ws/fleets/fleet-1/positions`);
  const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
  expect(code).toBe(1008);
});

it("closes the socket with 1008 when the fleet path is outside the scope", async () => {
  const ws = new WebSocket(`${baseUrl}/ws/fleets/fleet-OTHER/positions`, {
    headers: scopeHeaders("org-1", "fleet-1"),
  });
  const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
  expect(code).toBe(1008);
});
```

and update the existing happy-path stream tests to pass valid headers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/map && npx vitest run src/__tests__/websocket.test.ts`
Expected: the two new tests FAIL (connection stays open).

- [ ] **Step 3: Implement**

In the WS handler in `build-app.ts`, before sending the initial payload:

```ts
async (socket, request) => {
  let scope: TenantScope;
  try {
    scope = verifyScopeHeader(request.headers[SCOPE_HEADER_NAME], { secret: options.scopeSecret });
  } catch {
    socket.close(1008, "missing or invalid tenant scope");
    return;
  }
  const { fleetId } = request.params as { fleetId: string };
  if (fleetId !== scope.fleet_id) {
    socket.close(1008, "fleet scope mismatch");
    return;
  }
  // ...existing initial-send + subscribe + close handling unchanged
```

- [ ] **Step 4: Run the full map suite**

Run: `cd services/map && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/map
git commit -m "fix(map): require signed tenant scope on the WS positions stream"
```

---

### Task 7: `apps/web` — stop sending tenancy in bodies; delete the false security comments

**Files:**
- Modify: `apps/web/components/map/types.ts` (GeofenceFormInput; false comment)
- Modify: `apps/web/components/map/api.ts` (false comment; `listGeofences` drops the query param)
- Modify: `apps/web/components/map/GeofencePanel.tsx` (the `org_id: ""` payload)
- Modify: `apps/web/components/map/MapView.tsx` (call-site of `listGeofences`, check with `grep -n "listGeofences" apps/web/components/map/*.tsx`)
- Modify: `apps/web/components/chat/api.ts` (CreateChannelInput; stale comment)
- Modify: `apps/web/components/chat/ChatView.tsx` (createChannel call)
- Modify: `apps/web/components/board/api.ts` (doc comment only — bodies were already tenancy-free)
- Modify: `apps/web/components/map/__tests__/api.test.ts`, `apps/web/components/chat/__tests__/ChatView.test.tsx`

**Interfaces:**
- Consumes: the service-side body schemas from Tasks 3–5 (bodies must NOT contain `org_id`/`fleet_id`).
- Produces: `GeofenceFormInput = { asset_id, name, centerLat, centerLng, radiusMeters }`; `CreateChannelInput = { mission_id, name }`; `listGeofences(): Promise<Geofence[]>` (no arg).

- [ ] **Step 1: Update the tests first**

`apps/web/components/map/__tests__/api.test.ts` — the createGeofence expectation (line ~67) currently asserts `org_id: ""` in the JSON body: change the fixture input and body assertion to the five tenancy-free fields; add `expect(body).not.toHaveProperty("org_id")`. Update the `listGeofences` test to expect a fetch of `/api/map/geofences` (no `?fleet_id=`).

`apps/web/components/chat/__tests__/ChatView.test.tsx` — the test named "creates a new channel and selects it, sending org_id/fleet_id in the body" becomes "creates a new channel and selects it (tenancy comes from the gateway, not the body)": `expect(payload).toMatchObject({ mission_id: "mission-2", name: "New Ops" }); expect(payload).not.toHaveProperty("org_id");`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && npx vitest run components/map/__tests__/api.test.ts components/chat/__tests__/ChatView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the web changes**

`apps/web/components/map/types.ts`:

```ts
/** Payload for creating a geofence via the form. Tenant scope (org/fleet)
 * is attached server-side by the gateway as a signed header
 * (apps/web/lib/gateway-proxy.ts) — the body must not carry it. */
export interface GeofenceFormInput {
  asset_id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}
```

`apps/web/components/map/api.ts`:
- Header comment: replace the "(the gateway overwrites org_id/fleet_id regardless of what's sent)" clause with: the gateway attaches tenant scope as a signed internal header; clients never send `org_id`/`fleet_id` in paths, queries, or bodies — except the positions path segment, which the map service checks against the session scope.
- `listGeofences`:

```ts
export async function listGeofences(): Promise<Geofence[]> {
  const response = await fetch(`/api/map/geofences`, { method: "GET", cache: "no-store" });
  const body = await parseOrThrow<GeofenceListResponse>(response);
  return body.geofences;
}
```

`apps/web/components/map/GeofencePanel.tsx` — the createGeofence call becomes:

```ts
await createGeofence({
  asset_id: form.asset_id.trim(),
  name: form.name.trim(),
  centerLat,
  centerLng,
  radiusMeters,
});
```

If `fleetId` is now an unused prop of `GeofencePanel`, remove it from `GeofencePanelProps` and from the `<GeofencePanel ...>` call in `MapView.tsx`; if MapView displays it elsewhere, leave it. Update the `listGeofences(fleetId)` call in `MapView.tsx` to `listGeofences()`.

`apps/web/components/chat/api.ts`:

```ts
export interface CreateChannelInput {
  mission_id: string;
  name: string;
}
```

and update the header comment (delete the "`createChannel` additionally sends org_id/fleet_id in the body because…" sentence — that requirement is gone).

`apps/web/components/chat/ChatView.tsx` line ~68: `const created = await createChannel(input);` — then check whether `orgId`/`fleetId` props are still used elsewhere in the component (`grep -n "orgId\|fleetId" apps/web/components/chat/ChatView.tsx`); if not, remove them from `ChatViewProps` and from the page that renders `<ChatView>` (`grep -rn "ChatView" apps/web/app`).

`apps/web/components/board/api.ts` — doc comment: note that create bodies are tenancy-free by design and the service takes scope from the gateway's signed header (this also documents that board creates now actually work — the old body schema made every UI create 400).

- [ ] **Step 4: Run the web suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "fix(web): tenancy-free request bodies; delete false 'gateway overwrites body' comments (S-4)"
```

---

### Task 8: Default all service binds to loopback

**Files:**
- Modify: `services/board/src/server.ts:10`, `services/chat/src/server.ts:13`, `services/map/src/server.ts:57`, `services/registry/src/server.ts:21`, `services/hub/src/server.ts:26`, `services/fleet/src/server.ts:23`, `plugins/asset-vehicle/src/server.ts:11`

- [ ] **Step 1: Flip the default**

In each file: `const host = process.env.HOST ?? "0.0.0.0";` →

```ts
// Loopback by default (suggestions.md S-1): nothing needs these services
// off-box in local dev — the gateway, plugin client, and registry client
// all use localhost. Containerized/remote deploys set HOST=0.0.0.0.
const host = process.env.HOST ?? "127.0.0.1";
```

- [ ] **Step 2: Verify nothing depended on external binding**

Run: `grep -rn "http://" .env.example scripts/start-all.mjs | grep -v localhost | grep -v 127.0.0.1`
Expected: no service URLs on non-loopback hosts.

- [ ] **Step 3: Commit**

```bash
git add services plugins/asset-vehicle
git commit -m "fix(services): bind to loopback by default; deployments opt into 0.0.0.0 via HOST"
```

---

### Task 9: Whole-branch verification

- [ ] **Step 1: Full build + lint + tests + architecture guard**

```bash
pnpm build && pnpm lint && pnpm test && node scripts/check-architecture-rules.mjs
```

Expected: all green. (Go/Python services are untouched by this plan — skip their suites unless something above touched shared event schemas; it didn't.)

- [ ] **Step 2: Live smoke via the real stack (verify skill)**

`pnpm start:all`, then in a browser (or curl with the demo session): log in, MAP view loads positions (session fleet), **create a geofence from the panel — must succeed now (S-4 was a live 400)**, create a mission and a task from BOARD (also previously 400), create a chat channel. Then prove the negative: `curl -s localhost:4302/missions` (direct, no header) → 401; `curl -s "localhost:4401/fleets/fleet-demo/positions"` → 401.

- [ ] **Step 3: Commit any smoke-test fallout, then update memory**

Update the project memory file's suggestions.md progress line (NOW items 1, plus quick-wins: false comments, body schemas, loopback bind — done).
