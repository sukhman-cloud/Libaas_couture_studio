import "server-only";
import type {
  Category,
  Collection,
  Order,
  Product,
} from "@/types/domain";
import {
  ADMIN_SEARCH_FIELDS,
  type CatalogFacets,
  type CategoryQuery,
  type CollectionQuery,
  type ListParams,
  type OrderQuery,
  type OrderSort,
  type Paged,
  type ProductQuery,
  type ProductSort,
} from "@/server/data/repositories";

/**
 * Catalog query semantics — filtering, sorting, faceting and paging —
 * extracted from the JSON store provider so EVERY data provider shares the
 * exact same predicates. The Prisma/PostgreSQL provider (Phase 5D) loads
 * rows and runs these same functions rather than re-encoding the rules in
 * SQL; that is what guarantees a query can never behave differently
 * depending on which provider served it.
 *
 * If a filter rule ever changes, it changes HERE, once.
 *
 * These are pure functions over domain objects — no store access, no I/O.
 */

export function paginate<T>(rows: T[], params?: ListParams): T[] {
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  return rows.slice(offset, offset + limit);
}

/** Filter → sort → slice, returning the page plus the total match count. */
export function page<T>(rows: T[], params?: ListParams): Paged<T> {
  return { rows: paginate(rows, params), total: rows.length };
}

export function matchesText(
  haystacks: Array<string | undefined>,
  needle: string,
) {
  const term = needle.trim().toLowerCase();
  if (!term) return true;
  return haystacks.some((value) => value?.toLowerCase().includes(term));
}

/** The price a customer would pay — sale price when one is set. */
export function effectivePrice(product: Product): number {
  return product.salePrice?.amount ?? product.price.amount;
}

/**
 * Single source of truth for product filtering, shared by `query` and
 * `facets` so the two can never drift. Filters combine with AND.
 */
export function productMatches(product: Product, query: ProductQuery): boolean {
  if (query.excludeArchived && product.status === "archived") return false;
  if (query.status && product.status !== query.status) return false;
  if (query.availability && product.availability !== query.availability) {
    return false;
  }
  if (
    query.categoryId &&
    product.categoryId !== query.categoryId &&
    !product.secondaryCategoryIds.includes(query.categoryId)
  ) {
    return false;
  }
  if (query.collectionId && !product.collectionIds.includes(query.collectionId)) {
    return false;
  }
  if (query.featured !== undefined && product.isFeatured !== query.featured) {
    return false;
  }
  if (
    query.stitchingAvailable !== undefined &&
    product.stitchingAvailable !== query.stitchingAvailable
  ) {
    return false;
  }
  if (
    query.customizationAvailable !== undefined &&
    product.customizationAvailable !== query.customizationAvailable
  ) {
    return false;
  }
  if (query.fabric && product.attributes.fabric !== query.fabric) return false;
  if (query.colour && product.attributes.colour !== query.colour) return false;
  if (query.occasion && product.attributes.occasion !== query.occasion) {
    return false;
  }
  if (query.work && product.attributes.work !== query.work) return false;
  if (query.tag && !product.tags.includes(query.tag)) return false;

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const price = effectivePrice(product);
    if (query.priceMin !== undefined && price < query.priceMin) return false;
    if (query.priceMax !== undefined && price > query.priceMax) return false;
  }

  if (query.search) {
    const fields = query.searchFields ?? ADMIN_SEARCH_FIELDS;
    const haystacks: Array<string | undefined> = [];
    for (const field of fields) {
      if (field === "tags") haystacks.push(product.tags.join(" "));
      else haystacks.push(product[field]);
    }
    if (!matchesText(haystacks, query.search)) return false;
  }

  return true;
}

export function sortProducts(rows: Product[], sort: ProductSort | undefined) {
  const sorted = [...rows];
  switch (sort ?? "updated_desc") {
    case "created_desc":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "name_asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name_desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "price_asc":
      sorted.sort((a, b) => effectivePrice(a) - effectivePrice(b));
      break;
    case "price_desc":
      sorted.sort((a, b) => effectivePrice(b) - effectivePrice(a));
      break;
    default:
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return sorted;
}

/** Distinct attribute values + price bounds for an already-filtered set. */
export function computeProductFacets(rows: Product[]): CatalogFacets {
  const distinct = (
    pick: (product: Product) => string | undefined,
  ): string[] =>
    Array.from(
      new Set(
        rows
          .map(pick)
          .filter((value): value is string => Boolean(value?.trim())),
      ),
    ).sort((a, b) => a.localeCompare(b));

  const prices = rows.map(effectivePrice);
  return {
    fabrics: distinct((p) => p.attributes.fabric),
    colours: distinct((p) => p.attributes.colour),
    occasions: distinct((p) => p.attributes.occasion),
    works: distinct((p) => p.attributes.work),
    availabilities: Array.from(new Set(rows.map((p) => p.availability))).sort(),
    priceRange: prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null,
  };
}

/** Shared ordering for category/collection listings. */
function byOrderThenName<T extends { sortOrder: number; name: string }>(
  a: T,
  b: T,
): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/** Published categories/collections in display order (the `list()` shape). */
export function publishedInOrder<
  T extends { status: string; sortOrder: number; name: string },
>(rows: T[]): T[] {
  return rows.filter((r) => r.status === "published").sort(byOrderThenName);
}

export function queryCategories(
  rows: Category[],
  query: CategoryQuery = {},
): Paged<Category> {
  let matched = rows;
  if (query.excludeArchived) {
    matched = matched.filter((c) => c.status !== "archived");
  }
  if (query.status) matched = matched.filter((c) => c.status === query.status);
  if (query.search) {
    const term = query.search;
    matched = matched.filter((c) => matchesText([c.name, c.slug], term));
  }
  return page([...matched].sort(byOrderThenName), query);
}

export function queryCollections(
  rows: Collection[],
  query: CollectionQuery = {},
): Paged<Collection> {
  let matched = rows;
  if (query.excludeArchived) {
    matched = matched.filter((c) => c.status !== "archived");
  }
  if (query.status) matched = matched.filter((c) => c.status === query.status);
  if (query.search) {
    const term = query.search;
    matched = matched.filter((c) => matchesText([c.name, c.slug], term));
  }
  return page([...matched].sort(byOrderThenName), query);
}

/* ── orders (Phase 7C — the SHARED admin query rules) ──────────────── */

/**
 * One predicate for the admin order search: order number, customer name
 * and customer email only — never credentials, never internal ids. The
 * text matcher is the same case-insensitive substring rule the catalog
 * uses.
 */
export function orderMatches(order: Order, query: OrderQuery): boolean {
  if (query.status && order.status !== query.status) return false;
  if (query.search) {
    return matchesText(
      [order.orderNumber, order.customer.name, order.customer.email],
      query.search,
    );
  }
  return true;
}

/** Stable order sorting — every sort ends in an id tiebreak so paging
 *  never shuffles rows between requests. */
export function sortOrders(rows: Order[], sort: OrderSort = "newest"): Order[] {
  const byId = (a: Order, b: Order) => a.id.localeCompare(b.id);
  const sorted = [...rows];
  switch (sort) {
    case "oldest":
      sorted.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a, b),
      );
      break;
    case "total_desc":
      sorted.sort(
        (a, b) =>
          b.total.amount - a.total.amount ||
          b.createdAt.localeCompare(a.createdAt) ||
          byId(a, b),
      );
      break;
    case "total_asc":
      sorted.sort(
        (a, b) =>
          a.total.amount - b.total.amount ||
          b.createdAt.localeCompare(a.createdAt) ||
          byId(a, b),
      );
      break;
    default: // newest
      sorted.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b),
      );
  }
  return sorted;
}

/** Filter → sort → page, the one implementation both providers run. */
export function queryOrders(rows: Order[], query: OrderQuery): Paged<Order> {
  const matched = rows.filter((order) => orderMatches(order, query));
  return page(sortOrders(matched, query.sort), query);
}
