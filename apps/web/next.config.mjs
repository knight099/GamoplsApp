/**
 * Security headers (suggestions.md S-7). The CSP is deliberately simple:
 * no third-party scripts run in this app, and the only remote assets are
 * OpenStreetMap raster tiles for Leaflet (img-src). `'unsafe-inline'` /
 * `'unsafe-eval'` in script-src are required by Next.js's inline runtime
 * scripts and dev-mode react-refresh respectively; tighten with nonces if
 * a stricter posture is ever needed.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is a no-op over plain HTTP (local dev) and hardens TLS deploys.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet@4 (components/map/MapCanvas.tsx) doesn't tear down its
  // internal Leaflet map instance cleanly across Strict Mode's dev-only
  // double-invoked effects, throwing "Map container is already
  // initialized." This only ever manifests in `next dev` — Strict Mode's
  // extra checks never run in production regardless of this flag — so
  // turning it off only removes an additional dev-time diagnostic pass,
  // not any production behavior.
  reactStrictMode: false,
  devIndicators: false,
  // @gamopls/ui and @gamopls/auth are workspace TS packages published as
  // pre-built ESM (see their tsup builds) — no transpilePackages needed.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
