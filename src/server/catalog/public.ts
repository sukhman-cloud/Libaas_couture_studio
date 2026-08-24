import "server-only";
import type { ProductCardData } from "@/components/catalog/product-card";
import type { CatalogFilterParams } from "@/lib/catalog/shop-params";
import { getRepositories } from "@/server/data";
import {
  PUBLIC_SEARCH_FIELDS,
  type CatalogFacets,
  type ProductQuery,
} from "@/server/data/repositories";
import type {
  Category,
  Collection,
  Product,
} from "@/types/domain";

/**
 * Public catalog reads — the ONLY place customer-facing publication rules
 * live. Every customer page goes through here, so "published, not
 * archived" can never be forgotten on a new screen, and Phase 4C filters
 * plug into `listPublishedProducts` without touching any page.
 *
 * These helpers reuse the same repositories (and the same Product model)
 * as the admin catalog — there is no second customer product model.
 */

/** Filters a customer query can carry (already resolved to ids). */
export type PublicProductFilters = Pick<
  ProductQuery,
  | "categoryId"
  | "collectionId"
  | "availability"
  | "fabric"
  | "colour"
  | "occasion"
  | "work"
  | "tag"
  | "stitchingAvailable"
  | "customizationAvailable"
  | "featured"
  | "search"
  | "priceMin"
  | "priceMax"
  | "sort"
>;

/**
 * Turn URL params (slugs, yes/no, paise) into repository filters.
 * Unknown category/collection slugs resolve to nothing rather than
 * throwing — a hand-edited URL must degrade gracefully.
 */
export async function resolveCatalogFilters(
  params: CatalogFilterParams,
): Promise<{ filters: PublicProductFilters; unknown: string[] }> {
  const filters: PublicProductFilters = {};
  const unknown: string[] = [];

  if (params.category) {
    const category = await getPublishedCategoryBySlug(params.category);
    if (category) filters.categoryId = category.id;
    else unknown.push("category");
  }
  if (params.collection) {
    const collection = await getPublishedCollectionBySlug(params.collection);
    if (collection) filters.collectionId = collection.id;
    else unknown.push("collection");
  }

  if (params.q) filters.search = params.q;
  if (params.fabric) filters.fabric = params.fabric;
  if (params.colour) filters.colour = params.colour;
  if (params.occasion) filters.occasion = params.occasion;
  if (params.work) filters.work = params.work;
  if (params.availability) filters.availability = params.availability;
  if (params.stitching) filters.stitchingAvailable = params.stitching === "yes";
  if (params.customization) {
    filters.customizationAvailable = params.customization === "yes";
  }
  if (params.minPrice !== undefined) filters.priceMin = params.minPrice;
  if (params.maxPrice !== undefined) filters.priceMax = params.maxPrice;

  return { filters, unknown };
}

export interface PublicProductPage {
  products: Product[];
  total: number;
  page: number;
  pageCount: number;
}

export const PRODUCTS_PER_PAGE = 12;

export async function listPublishedProducts(
  filters: PublicProductFilters = {},
  page = 1,
  perPage = PRODUCTS_PER_PAGE,
): Promise<PublicProductPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const { products } = getRepositories();

  const result = await products.query({
    ...filters,
    // Publication rule — never overridable by a caller.
    status: "published",
    // Customer search never looks at internal identifiers (SKU/slug).
    searchFields: PUBLIC_SEARCH_FIELDS,
    limit: perPage,
    offset: (safePage - 1) * perPage,
  });

  return {
    products: result.rows,
    total: result.total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(result.total / perPage)),
  };
}

export async function getPublishedProductBySlug(
  slug: string,
): Promise<Product | null> {
  const product = await getRepositories().products.getBySlug(slug);
  return product && product.status === "published" ? product : null;
}

export async function listPublishedCategories(): Promise<Category[]> {
  // Repository `list()` already returns published-only in sort order.
  return getRepositories().categories.list();
}

export async function getPublishedCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  const category = await getRepositories().categories.getBySlug(slug);
  return category && category.status === "published" ? category : null;
}

export async function listPublishedCollections(): Promise<Collection[]> {
  return getRepositories().collections.list();
}

export async function getPublishedCollectionBySlug(
  slug: string,
): Promise<Collection | null> {
  const collection = await getRepositories().collections.getBySlug(slug);
  return collection && collection.status === "published" ? collection : null;
}

/** Published-product counts for a set of categories or collections. */
export async function countPublishedByGroup(
  key: "categoryId" | "collectionId",
  ids: string[],
): Promise<Record<string, number>> {
  const { products } = getRepositories();
  const entries = await Promise.all(
    ids.map(async (id) => {
      const result = await products.query({
        [key]: id,
        status: "published",
        limit: 0,
      });
      return [id, result.total] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * The single image a card should show: the primary one, else the first by
 * sort order. Returns null when the product has no media (the UI then
 * renders a placeholder — never a stock photo).
 */
export function primaryMediaOf(product: Product) {
  if (product.media.length === 0) return null;
  const sorted = [...product.media].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((item) => item.isPrimary) ?? sorted[0];
}

/**
 * Project products onto the card shape — the only data that crosses to the
 * customer UI. Admin-only fields (SKU, internal ids, storage keys, draft
 * state, timestamps) are deliberately not included.
 */
export function toProductCards(
  products: Product[],
  categoryNames?: Map<string, string>,
): ProductCardData[] {
  return products.map((product) => {
    const media = primaryMediaOf(product);
    return {
      slug: product.slug,
      name: product.name,
      price: product.price,
      salePrice: product.salePrice,
      availability: product.availability,
      isFeatured: product.isFeatured,
      stitchingAvailable: product.stitchingAvailable,
      customizationAvailable: product.customizationAvailable,
      categoryName: product.categoryId
        ? categoryNames?.get(product.categoryId)
        : undefined,
      image: media ? { mediaId: media.mediaId, alt: media.alt } : undefined,
    };
  });
}

/**
 * Filter options, derived from the published catalog only. Options for a
 * value nobody uses are never offered, and scoping to `within` (e.g. the
 * current category page) keeps the choices relevant.
 */
export async function getCatalogFacets(
  within: PublicProductFilters = {},
): Promise<CatalogFacets> {
  return getRepositories().products.facets({
    ...within,
    status: "published",
  });
}

/** Names of published categories, for card labels. */
export async function publishedCategoryNames(): Promise<Map<string, string>> {
  const categories = await listPublishedCategories();
  return new Map(categories.map((category) => [category.id, category.name]));
}
