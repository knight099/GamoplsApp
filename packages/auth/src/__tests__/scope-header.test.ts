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
      Buffer.from(
        JSON.stringify({ org_id: "org-EVIL", fleet_id: "fleet-1", exp: 9999999999 }),
      ).toString("base64url") +
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
    for (const bad of [
      "nodots",
      "a.b.c",
      "!!!.###",
      Buffer.from("{}").toString("base64url") + ".",
    ]) {
      expect(() => verifyScopeHeader(bad, { secret: SECRET })).toThrow(ScopeVerificationError);
    }
  });

  it("rejects payloads with empty org_id/fleet_id", () => {
    const header = signScopeHeader({ org_id: "", fleet_id: "fleet-1" }, { secret: SECRET });
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
