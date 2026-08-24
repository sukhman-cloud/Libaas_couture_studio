import type { ProductSort } from "@/server/data/repositories";

/**
 * Catalog URL contract — the single place that turns search params into a
 * query and back into links. Every filter, the sort and the page live in
 * the URL, so refresh, back/forward and sharing all reproduce the same
 * results without any client state.
 *
 * Invalid values are ignored rather than fatal: a hand-edited URL must
 * never break the page.
 */

export interface SortOption {
  value: string;
  label: string;
  sort: ProductSort;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: "newest", label: "Newest first", sort: "created_desc" },
  { value: "price-asc", label: "Price: low to high", sort: "price_asc" },
  { value: "price-desc", label: "Price: high to low", sort: "price_desc" },
  { value: "name-asc", label: "Name: A to Z", sort: "name_asc" },
  { value: "name-desc", label: "Name: Z to A", sort: "name_desc" },
];

export const DEFAULT_SORT = SORT_OPTIONS[0];

export const AVAILABILITY_VALUES = [
  "available",
  "made_to_order",
  "out_of_stock",
  "discontinued",
] as const;

export type AvailabilityValue = (typeof AVAILABILITY_VALUES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityValue, string> = {
  available: "Available",
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
};

/** Filter params carried in the URL. Slugs — never internal ids. */
export interface CatalogFilterParams {
  q?: string;
  category?: string;
  collection?: string;
  fabric?: string;
  colour?: string;
  occasion?: string;
  work?: string;
  availability?: AvailabilityValue;
  stitching?: "yes" | "no";
  customization?: "yes" | "no";
  /** Integer paise, already validated. */
  minPrice?: number;
  maxPrice?: number;
}

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export interface ParsedCatalogParams {
  page: number;
  sortValue: string;
  sort: ProductSort;
  filters: CatalogFilterParams;
  /** Exactly the params that are set, for rebuilding links. */
  active: Record<string, string>;
  /** Active filters excluding the free-text query (see spec: q is not a filter). */
  filterCount: number;
  hasAnyParam: boolean;
}

const MAX_QUERY_LENGTH = 100;
const MAX_VALUE_LENGTH = 60;
/** ₹1,00,00,000 in paise — the same ceiling the admin price field uses. */
const MAX_PAISE = 1_000_000_000;

function single(value: string | string[] | undefined): string {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
  return (raw ?? "").trim();
}

/** Collapse repeated whitespace and cap the length. */
export function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

function text(value: string): string | undefined {
  const normalized = normalizeQuery(value);
  return normalized ? normalized.slice(0, MAX_VALUE_LENGTH) : undefined;
}

/**
 * Rupee input → integer paise. Accepts "2499" or "2499.50"; rejects
 * negatives, junk and absurd values. Money never goes through floats.
 */
export function rupeesToPaise(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const paise = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(paise) || paise < 0 || paise > MAX_PAISE) return undefined;
  return paise;
}

/** Paise → the rupee string shown in a price input. */
export function paiseToRupees(paise: number | undefined): string {
  if (paise === undefined) return "";
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

function yesNo(value: string): "yes" | "no" | undefined {
  if (value === "yes") return "yes";
  if (value === "no") return "no";
  return undefined;
}

export function parseCatalogParams(
  params: CatalogSearchParams,
): ParsedCatalogParams {
  const active: Record<string, string> = {};
  const filters: CatalogFilterParams = {};

  const set = <K extends keyof CatalogFilterParams>(
    param: string,
    key: K,
    value: CatalogFilterParams[K] | undefined,
    urlValue?: string,
  ) => {
    if (value === undefined) return;
    filters[key] = value;
    active[param] = urlValue ?? String(value);
  };

  set("q", "q", text(single(params.q)));
  set("category", "category", text(single(params.category)));
  set("collection", "collection", text(single(params.collection)));
  set("fabric", "fabric", text(single(params.fabric)));
  set("colour", "colour", text(single(params.colour)));
  set("occasion", "occasion", text(single(params.occasion)));
  set("work", "work", text(single(params.work)));

  const availability = single(params.availability);
  if ((AVAILABILITY_VALUES as readonly string[]).includes(availability)) {
    set("availability", "availability", availability as AvailabilityValue);
  }

  set("stitching", "stitching", yesNo(single(params.stitching)));
  set("customization", "customization", yesNo(single(params.customization)));

  // Price: parse both, then normalise an inverted range by swapping it.
  let minPrice = rupeesToPaise(single(params.minPrice));
  let maxPrice = rupeesToPaise(single(params.maxPrice));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  if (minPrice !== undefined) {
    filters.minPrice = minPrice;
    active.minPrice = paiseToRupees(minPrice);
  }
  if (maxPrice !== undefined) {
    filters.maxPrice = maxPrice;
    active.maxPrice = paiseToRupees(maxPrice);
  }

  const sortValue = single(params.sort);
  const sortOption =
    SORT_OPTIONS.find((option) => option.value === sortValue) ?? DEFAULT_SORT;
  if (sortOption.value !== DEFAULT_SORT.value) active.sort = sortOption.value;

  const pageRaw = Number(single(params.page));
  const page =
    Number.isFinite(pageRaw) && pageRaw > 1 ? Math.min(Math.floor(pageRaw), 10_000) : 1;
  if (page > 1) active.page = String(page);

  // The free-text query is shown as its own control, not counted as a filter.
  const filterCount = Object.keys(active).filter(
    (key) => key !== "q" && key !== "sort" && key !== "page",
  ).length;

  return {
    page,
    sortValue: sortOption.value,
    sort: sortOption.sort,
    filters,
    active,
    filterCount,
    hasAnyParam: Object.keys(active).length > 0,
  };
}

/**
 * Build a catalog URL from the active params plus overrides.
 * Any change other than paging resets to page 1 — a stale page number
 * would otherwise show a misleading empty result.
 */
export function catalogHref(
  basePath: string,
  active: Record<string, string>,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams(active);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (!("page" in overrides)) params.delete("page");
  if (params.get("page") === "1") params.delete("page");
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Human labels for the active-filter chips. */
export const FILTER_CHIP_LABELS: Record<string, string> = {
  category: "Category",
  collection: "Collection",
  fabric: "Fabric",
  colour: "Colour",
  occasion: "Occasion",
  work: "Work",
  availability: "Availability",
  stitching: "Stitching",
  customization: "Customisation",
  minPrice: "Min price",
  maxPrice: "Max price",
};
