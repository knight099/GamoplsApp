/**
 * Minimal in-memory sliding-window rate limiter (suggestions.md S-6).
 *
 * Deliberately dependency-free for the V1 demo-login endpoint: one web
 * process serves the pilot, so process-local state is sufficient. When
 * real auth lands (Auth.js + user store) swap this for a Redis-backed
 * limiter (@upstash/ratelimit) behind the same function shape.
 */

interface WindowState {
  /** Epoch ms of each attempt still inside the window. */
  attempts: number[];
}

const buckets = new Map<string, WindowState>();

export interface RateLimitOptions {
  /** Max attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest attempt leaves the window (only when blocked). */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now = Date.now(),
): RateLimitResult {
  const state = buckets.get(key) ?? { attempts: [] };
  state.attempts = state.attempts.filter((t) => now - t < windowMs);

  if (state.attempts.length >= limit) {
    buckets.set(key, state);
    const oldest = state.attempts[0];
    return { allowed: false, retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000) };
  }

  state.attempts.push(now);
  buckets.set(key, state);

  // Opportunistic cleanup so abandoned keys don't accumulate forever.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.attempts.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test helper: drop all tracked windows. */
export function resetRateLimits(): void {
  buckets.clear();
}
