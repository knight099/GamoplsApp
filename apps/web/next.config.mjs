/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @gamopls/ui and @gamopls/auth are workspace TS packages published as
  // pre-built ESM (see their tsup builds) — no transpilePackages needed.
};

export default nextConfig;
