import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { issueJwt, verifyJwt, JwtVerificationError } from "../jwt.js";
import type { GamoplsJwtClaims } from "../claims.js";

const SECRET = "test-secret-do-not-use-in-prod";

const CLAIMS: GamoplsJwtClaims = {
  user_id: "user-1",
  org_id: "org-abc",
  fleet_id: "fleet-xyz",
  role: "fleet_manager",
};

describe("@gamopls/auth jwt", () => {
  it("issues a token and round-trips through verify with the original claims", async () => {
    const token = await issueJwt(CLAIMS, { secret: SECRET });
    const verified = await verifyJwt(token, { secret: SECRET });

    expect(verified.user_id).toBe(CLAIMS.user_id);
    expect(verified.org_id).toBe(CLAIMS.org_id);
    expect(verified.fleet_id).toBe(CLAIMS.fleet_id);
    expect(verified.role).toBe(CLAIMS.role);
    expect(typeof verified.exp).toBe("number");
    expect(typeof verified.iat).toBe("number");
    expect(verified.exp).toBeGreaterThan(verified.iat);
  });

  it("rejects an expired token", async () => {
    const token = await issueJwt(CLAIMS, { secret: SECRET, expiresIn: "1s" });
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(verifyJwt(token, { secret: SECRET })).rejects.toThrow(JwtVerificationError);
  });

  it("rejects a token tampered with after signing", async () => {
    const token = await issueJwt(CLAIMS, { secret: SECRET });
    const [header, payload, signature] = token.split(".");
    // Flip the org_id in the payload without re-signing.
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decodedPayload.org_id = "org-attacker";
    const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    await expect(verifyJwt(tampered, { secret: SECRET })).rejects.toThrow(JwtVerificationError);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyJwt("not-a-jwt", { secret: SECRET })).rejects.toThrow(JwtVerificationError);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueJwt(CLAIMS, { secret: "other-secret" });
    await expect(verifyJwt(token, { secret: SECRET })).rejects.toThrow(JwtVerificationError);
  });

  it("rejects a well-formed JWT missing required GAMOPLS claims", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ foo: "bar" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(verifyJwt(token, { secret: SECRET })).rejects.toThrow(JwtVerificationError);
  });
});
