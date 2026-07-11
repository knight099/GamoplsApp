import { jwtVerify, SignJWT, errors as joseErrors } from "jose";
import type { GamoplsJwtClaims, VerifiedGamoplsJwtClaims } from "./claims.js";
import { isGamoplsJwtClaims } from "./claims.js";
import { assertProductionSecret } from "./scope-header.js";

const DEFAULT_EXPIRES_IN = "1h";
const ALG = "HS256";

export class JwtVerificationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

function resolveSecretKey(secret: string): Uint8Array {
  // Refuse .env.example placeholder secrets in production (S-6).
  assertProductionSecret("JWT_SECRET", secret);
  return new TextEncoder().encode(secret);
}

export interface IssueJwtOptions {
  /** Overrides `JWT_EXPIRES_IN` / the 1h default. Any value `jose`'s `setExpirationTime` accepts, e.g. "1h", "30m", "7d". */
  expiresIn?: string;
  /** Overrides `process.env.JWT_SECRET`. */
  secret?: string;
}

/**
 * Issues a signed JWT carrying `org_id`/`fleet_id`/`role`/`user_id` claims.
 *
 * V1 placeholder: there is no real identity provider yet, so this is called
 * by apps/web's demo login route after a hardcoded/env-configured credential
 * check — not a substitute for real auth in production. Swap for
 * Auth0/Clerk-issued tokens later without changing the claims shape.
 */
export async function issueJwt(
  claims: GamoplsJwtClaims,
  options: IssueJwtOptions = {},
): Promise<string> {
  const secret = options.secret ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Configure it via env (see .env.example) or pass { secret } explicitly.",
    );
  }
  const expiresIn = options.expiresIn ?? process.env.JWT_EXPIRES_IN ?? DEFAULT_EXPIRES_IN;

  return new SignJWT({
    user_id: claims.user_id,
    org_id: claims.org_id,
    fleet_id: claims.fleet_id,
    role: claims.role,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(resolveSecretKey(secret));
}

export interface VerifyJwtOptions {
  /** Overrides `process.env.JWT_SECRET`. */
  secret?: string;
}

/**
 * Verifies a JWT's signature and expiry, and returns its typed claims.
 * Throws `JwtVerificationError` for expired, malformed, tampered, or
 * otherwise invalid tokens — callers (gateway route handlers) should treat
 * any thrown error as "reject with 401", not distinguish the sub-cases.
 */
export async function verifyJwt(
  token: string,
  options: VerifyJwtOptions = {},
): Promise<VerifiedGamoplsJwtClaims> {
  const secret = options.secret ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Configure it via env (see .env.example) or pass { secret } explicitly.",
    );
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, resolveSecretKey(secret), { algorithms: [ALG] }));
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new JwtVerificationError("JWT has expired", err);
    }
    throw new JwtVerificationError("JWT is malformed or has an invalid signature", err);
  }

  const { iat, exp } = payload;
  if (!isGamoplsJwtClaims(payload) || typeof exp !== "number" || typeof iat !== "number") {
    throw new JwtVerificationError("JWT is missing required GAMOPLS claims");
  }

  return {
    user_id: payload.user_id,
    org_id: payload.org_id,
    fleet_id: payload.fleet_id,
    role: payload.role,
    iat,
    exp,
  };
}
