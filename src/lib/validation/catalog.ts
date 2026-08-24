import { z } from "zod";

/**
 * Catalog validation — shared by the admin server actions (the authority)
 * and the forms. Money is handled in integer minor units (paise) so no
 * price is ever computed in floating point.
 */

/* ── slugs & SKUs ───────────────────────────────────────────────── */

/** URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const SLUG_MAX = 80;

/**
 * Append -2, -3 … until the slug is unique. `exists` receives a candidate
 * and reports whether it is already taken by a *different* record.
 *
 * The root is trimmed BEFORE the suffix is appended, so a maximum-length
 * root can still produce distinct, schema-valid slugs (truncating after
 * appending would collapse every candidate back to the same string, or
 * leave an invalid trailing hyphen).
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "item";
  if (!(await exists(root))) return root;

  const withSuffix = (suffix: string) =>
    slugify(`${root.slice(0, SLUG_MAX - suffix.length - 1)}-${suffix}`);

  for (let suffix = 2; suffix < 200; suffix++) {
    const candidate = withSuffix(String(suffix));
    if (candidate && !(await exists(candidate))) return candidate;
  }

  // Terminal fallback — a short random token instead of failing the save.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = withSuffix(
      Math.random().toString(36).slice(2, 7),
    );
    if (candidate && !(await exists(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique slug.");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Slug is required.")
  .max(80, "Slug is too long.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens only.",
  );

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "SKU must be at least 2 characters.")
  .max(32, "SKU is too long.")
  .regex(
    /^[A-Z0-9][A-Z0-9._-]*$/,
    "Use letters, numbers, dots, hyphens and underscores.",
  );

/** Predictable, editable SKU suggestion — never a fabricated product code. */
export function suggestSku(name: string, seed: string): string {
  const prefix =
    slugify(name)
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase() || "ITEM";
  return `${prefix}-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase()}`;
}

/* ── money ──────────────────────────────────────────────────────── */

/** ₹1,00,00,000 in paise — a sanity ceiling, not a business rule. */
const MAX_AMOUNT_PAISE = 1_000_000_000;

/** Rupee input (e.g. "2499.50") → integer paise. */
export const rupeesToPaiseSchema = z
  .string()
  .trim()
  .min(1, "Price is required.")
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 2499 or 2499.50.")
  .transform((value) => Math.round(Number(value) * 100))
  .refine((paise) => paise >= 0, "Price cannot be negative.")
  .refine((paise) => paise <= MAX_AMOUNT_PAISE, "Price is too large.");

/** Optional rupee input — empty string means "not set". */
export const optionalRupeesToPaiseSchema = z
  .union([z.literal(""), rupeesToPaiseSchema])
  .transform((value) => (value === "" ? undefined : value));

/** Paise → the rupee string shown in a form input. */
export function paiseToRupeeInput(paise: number | undefined): string {
  if (paise === undefined) return "";
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

/* ── shared enums ───────────────────────────────────────────────── */

export const catalogStatusSchema = z.enum(["draft", "published", "archived"]);
export const availabilitySchema = z.enum([
  "available",
  "made_to_order",
  "out_of_stock",
  "discontinued",
]);

const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long.`)
    .optional()
    .transform((value) => (value ? value : undefined));

/* ── tags ───────────────────────────────────────────────────────── */

const TAG_PATTERN = /^[a-z0-9][a-z0-9 -]{0,29}$/;

/**
 * Comma-separated input → a normalized, de-duplicated tag list. Stored as a
 * structured array (never as one uncontrolled string).
 */
export function parseTags(input: unknown): {
  tags: string[];
  error?: string;
} {
  if (typeof input !== "string" || input.trim() === "") return { tags: [] };
  const raw = input
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  const unique = Array.from(new Set(raw));
  if (unique.length > 20) {
    return { tags: [], error: "Use at most 20 tags." };
  }
  const invalid = unique.find((tag) => !TAG_PATTERN.test(tag));
  if (invalid) {
    return {
      tags: [],
      error: `“${invalid}” is not a valid tag — use letters, numbers, spaces and hyphens (max 30 characters).`,
    };
  }
  return { tags: unique };
}

/* ── product ────────────────────────────────────────────────────── */

export const productSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required.")
      .max(120, "Name is too long."),
    sku: skuSchema,
    slug: z.union([z.literal(""), slugSchema]),
    shortDescription: optionalText(200, "Short description"),
    description: z
      .string()
      .trim()
      .max(5000, "Description is too long.")
      .default(""),
    categoryId: optionalText(64, "Category"),
    price: rupeesToPaiseSchema,
    salePrice: optionalRupeesToPaiseSchema,
    status: catalogStatusSchema,
    availability: availabilitySchema,
    isFeatured: checkboxSchema,
    stitchingAvailable: checkboxSchema,
    customizationAvailable: checkboxSchema,
    fabric: optionalText(60, "Fabric"),
    colour: optionalText(60, "Colour"),
    occasion: optionalText(60, "Occasion"),
    work: optionalText(60, "Work"),
    fit: optionalText(60, "Fit"),
  })
  .refine(
    (data) => data.salePrice === undefined || data.salePrice < data.price,
    {
      message: "Sale price must be lower than the regular price.",
      path: ["salePrice"],
    },
  );

export type ProductInput = z.infer<typeof productSchema>;

/* ── category & collection ──────────────────────────────────────── */

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name is too long."),
  slug: z.union([z.literal(""), slugSchema]),
  description: optionalText(500, "Description"),
  parentId: optionalText(64, "Parent category"),
  sortOrder: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(9999)])
    .transform((value) => (value === "" ? 0 : value)),
  status: catalogStatusSchema,
});

export const collectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name is too long."),
  slug: z.union([z.literal(""), slugSchema]),
  description: optionalText(500, "Description"),
  sortOrder: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(9999)])
    .transform((value) => (value === "" ? 0 : value)),
  status: catalogStatusSchema,
});
