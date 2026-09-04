import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Admin/account/checkout are already noindex via page metadata (defense in
 * depth); this also keeps crawlers from even requesting those paths.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/checkout", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
