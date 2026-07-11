import { NextRequest, NextResponse } from "next/server";
import {
  verifyJwt,
  JwtVerificationError,
  SESSION_COOKIE_NAME,
  SCOPE_HEADER_NAME,
  signScopeHeader,
} from "@gamopls/auth";

/**
 * Shared BFF gateway logic for reaching services/map|chat|board|hub.
 *
 * Per CLAUDE.md ("Multi-tenancy scoping is enforced at the API gateway, not
 * per-query") and PLAN.md 6.3, this is the ONLY path apps/web uses to reach
 * those services. Every route handler built with `createGatewayHandler`:
 *
 *   1. Reads the JWT from the httpOnly session cookie and verifies it via
 *      @gamopls/auth. Missing/invalid/expired/tampered token -> 401, request
 *      never reaches the downstream service.
 *   2. Forwards the request to `<baseUrl><path>`, where `baseUrl` comes from
 *      the env var named by `serviceBaseUrlEnvVar` (e.g. "MAP_SERVICE_URL").
 *   3. Injects the verified tenant scope two ways:
 *      a. A signed short-TTL `x-gamopls-scope` header (HMAC over
 *         org_id/fleet_id/exp with INTERNAL_SCOPE_SECRET) — the
 *         AUTHORITATIVE channel. services/board|chat|map verify it and take
 *         tenancy exclusively from it; a direct network peer without the
 *         secret cannot forge it, and any client-supplied copy of the
 *         header is stripped before signing (see
 *         HOP_BY_HOP_REQUEST_HEADERS).
 *      b. `org_id`/`fleet_id` query params, OVERWRITING any client-supplied
 *         values — transitional, consumed by services/hub and
 *         services/fleet until they migrate to the header.
 *
 * Contract for agents building MAP/CHAT/BOARD/HUB views:
 *   - Call `fetch('/api/map/...')`, `fetch('/api/chat/...')`, etc. from
 *     client/server components. Never fetch services/map etc. directly.
 *   - Never put `org_id`/`fleet_id` in request bodies — services derive
 *     tenant scope from the gateway, and body-carried tenancy is rejected
 *     schema-side (suggestions.md S-1).
 */

export const ORG_ID_QUERY_PARAM = "org_id";
export const FLEET_ID_QUERY_PARAM = "fleet_id";

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "transfer-encoding",
  // Client-supplied scope headers are always discarded; the gateway mints
  // its own signed header from the verified JWT below.
  SCOPE_HEADER_NAME,
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

export interface GatewayRouteContext {
  params: Promise<{ path?: string[] }>;
}

/**
 * Builds the upstream URL for a forwarded request: `<baseUrl>/<path>` with
 * `org_id`/`fleet_id` query params forced to the values from the verified
 * JWT, discarding any client-supplied `org_id`/`fleet_id` in the incoming
 * query string.
 */
export function buildUpstreamUrl(
  baseUrl: string,
  pathSegments: string[],
  incomingSearch: string,
  scope: { org_id: string; fleet_id: string },
): string {
  const url = new URL(baseUrl.replace(/\/+$/, "") + "/" + pathSegments.join("/"));
  const search = new URLSearchParams(incomingSearch);
  search.set(ORG_ID_QUERY_PARAM, scope.org_id);
  search.set(FLEET_ID_QUERY_PARAM, scope.fleet_id);
  url.search = search.toString();
  return url.toString();
}

function forwardableRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function forwardableResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

/**
 * Creates a Next.js Route Handler that proxies `/api/<service>/[...path]`
 * requests to the backend service named by `serviceBaseUrlEnvVar`, enforcing
 * JWT auth and org/fleet scope injection as described above.
 *
 * Usage (e.g. `app/api/map/[...path]/route.ts`):
 *
 *   const handler = createGatewayHandler("MAP_SERVICE_URL");
 *   export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
 */
export function createGatewayHandler(serviceBaseUrlEnvVar: string) {
  return async function gatewayHandler(
    request: NextRequest,
    context: GatewayRouteContext,
  ): Promise<NextResponse> {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: missing session" }, { status: 401 });
    }

    let claims;
    try {
      claims = await verifyJwt(token);
    } catch (err) {
      if (err instanceof JwtVerificationError) {
        return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
      }
      throw err;
    }

    const baseUrl = process.env[serviceBaseUrlEnvVar];
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Gateway misconfigured: ${serviceBaseUrlEnvVar} is not set` },
        { status: 500 },
      );
    }

    const { path } = await context.params;
    const upstreamUrl = buildUpstreamUrl(baseUrl, path ?? [], request.nextUrl.search, {
      org_id: claims.org_id,
      fleet_id: claims.fleet_id,
    });

    const hasBody = !["GET", "HEAD"].includes(request.method);

    const headers = forwardableRequestHeaders(request);
    headers.set(
      SCOPE_HEADER_NAME,
      signScopeHeader({ org_id: claims.org_id, fleet_id: claims.fleet_id }),
    );

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // @ts-expect-error -- duplex is required by undici for streaming bodies but missing from the RequestInit type.
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    });

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: forwardableResponseHeaders(upstreamResponse),
    });
  };
}
