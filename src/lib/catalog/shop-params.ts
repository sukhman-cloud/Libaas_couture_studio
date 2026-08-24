import type { ProductSort } from "@/server/data/repositories";
import type { PublicProductFilters } from "@/server/catalog/public";

/**
 * Catalog URL contract — one place that turns search params into a query
 * and back into links. Adding a Phase 4C filter means adding it to
 * FILTER_PARAMS (and the form), not editing any page.
 */

export interface SortOption {
  value: string;
  label: string;
  sort: ProductSort;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: "newest", label: "Newest first", sort: "created_desc" },
  { value: "price_asc", label: "Price: low to high", sort: "price_asc" },
  { value: "price_desc", label: "Price: high to low", sort: "price_desc" },
  { value: "name_asc", label: "Name: A–Z", sort: "name_asc" },
];

export const DEFAULT_SORT = SORT_OPTIONS[0];

/**
 * URL param → repository filter key. Phase 4C adds fabric/colour/etc. by
 * extending this map plus the toolbar UI; nothing else changes.
 */
const FILTER_PARAMS = {
  category: "categoryId",
  collection: "collectionId",
  availability: "availability",
  fabric: "fabric",
  colour: "colour",
  occasion: "occasion",
  tag: "tag",
  q: "search",
} as const satisfies Record<string, keyof PublicProductFilters>;

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export interface ParsedCatalogParams {
  page: number;
  sortValue: string;
  filters: PublicProductFilters;
  /** Params that are actually set — for preserving state in links. */
  active: Record<string, string>;
  hasFilters: boolean;
}

function single(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return "";
}

export function parseCatalogParams(
  params: CatalogSearchParams,
): ParsedCatalogParams {
  const active: Record<string, string> = {};
  const filters: PublicProductFilters = {};

  for (const [param, filterKey] of Object.entries(FILTER_PARAMS)) {
    const value = single(params[param]);
    if (!value) continue;
    active[param] = value;
    // Every mapped filter is a string-valued repository field.
    (filters as Record<string, string>)[filterKey] = value;
  }

  const sortValue = single(params.sort);
  const sortOption =
    SORT_OPTIONS.find((option) => option.value === sortValue) ?? DEFAULT_SORT;
  if (sortOption.value !== DEFAULT_SORT.value) active.sort = sortOption.value;
  filters.sort = sortOption.sort;

  const pageRaw = Number(single(params.page));
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;

  return {
    page,
    sortValue: sortOption.value,
    filters,
    active,
    hasFilters: Object.keys(active).some((key) => key !== "sort"),
  };
}

/** Build a catalog URL, keeping the active params and applying overrides. */
export function catalogHref(
  basePath: string,
  active: Record<string, string>,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams(active);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "" || value === 1) params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
