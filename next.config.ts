import type { NextConfig } from "next";

/**
 * Baseline security headers (Phase 12). No CSP is set here deliberately —
 * this app renders third-party media (Instagram CDN images in the home
 * lookbook, /api/media local uploads) and Google Fonts, and a CSP tight
 * enough to matter but not break those would need a real source audit
 * before shipping; adding a permissive one would be security theater.
 * The rest of these are safe, well-understood defaults with no
 * app-breaking trade-offs.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Must stay above MAX_IMAGE_BYTES (5 MB in src/server/storage/image.ts)
      // plus multipart overhead, so an oversized upload is rejected by the
      // app's own validation message rather than by the framework.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        // Every route — these headers carry no functional risk anywhere.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Account/checkout/admin serve customer- or operator-private data;
        // an intermediate cache must never store a response meant for one
        // signed-in session and hand it to another.
        source: "/(account|checkout|admin)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
