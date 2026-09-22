import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Passkeys need publickey-credentials-*; everything else the app does not use is switched off.
  {
    key: "Permissions-Policy",
    value:
      "publickey-credentials-get=(self), publickey-credentials-create=(self), camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // A self-contained server for the container image; traced from the monorepo root so workspace packages ride along.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: [
    "@yotrade/core",
    "@yotrade/plugin-alchemy",
    "@yotrade/plugin-kuru",
    "@yotrade/plugin-mera",
    "@yotrade/plugin-perps",
    "@yotrade/plugin-tournament",
  ],
  headers: () => Promise.resolve([{ source: "/:path*", headers: securityHeaders }]),
};

export default nextConfig;
