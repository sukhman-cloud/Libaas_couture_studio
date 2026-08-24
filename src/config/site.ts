/**
 * Central site configuration — the single place for brand & business facts.
 *
 * IMPORTANT: fields marked `PLACEHOLDER` are intentionally empty or generic.
 * Fill them with real values provided by the boutique owner; do NOT invent
 * addresses, phone numbers, prices or hours.
 */
export const siteConfig = {
  name: "Libaas Couture Studio",
  shortName: "Libaas",
  /** PLACEHOLDER — replace with the boutique's approved tagline. */
  tagline: "Designer Suits · Handwork · Stitching",
  description:
    "Libaas Couture Studio — boutique application for bespoke couture, custom stitching and handwork.",
  locale: "en-IN",
  currency: "INR",

  /** Brand assets (served from /public). */
  assets: {
    logo: "/brand/logo.jpg",
  },

  /** Social links provided by the owner. */
  social: {
    instagram: "https://www.instagram.com/libaas_couture_studio",
    facebook: "https://www.facebook.com/libaasCoutureStudio",
  },

  /** PLACEHOLDER contact details — fill with real values before launch. */
  contact: {
    phone: "", // e.g. "+91 XXXXX XXXXX"
    whatsapp: "", // e.g. "+91XXXXXXXXXX"
    email: "", // e.g. "hello@example.com"
  },

  /** PLACEHOLDER address — fill with the exact address before launch. */
  address: {
    line1: "", // e.g. "First Floor, SCO ..."
    line2: "Sector 79",
    city: "Mohali (Sahibzada Ajit Singh Nagar)",
    state: "Punjab",
    postalCode: "", // e.g. "1403XX"
    country: "India",
  },

  /** PLACEHOLDER business hours — confirm with the owner. */
  hours: [] as ReadonlyArray<{ days: string; open: string; close: string }>,
} as const;

export type SiteConfig = typeof siteConfig;
