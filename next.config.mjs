/** @type {import('next').NextConfig} */
const nextConfig = {
  // The contagion snapshot is read from disk when the database is unreachable.
  experimental: { outputFileTracingIncludes: { "/contagion": ["./data/contagion.json"], "/api/**/*": ["./data/contagion.json"] } },
};

export default nextConfig;
