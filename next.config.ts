import type { NextConfig } from "next";

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
};

export default nextConfig;
