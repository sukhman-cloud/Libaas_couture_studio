import "server-only";
import type {
  Appointment,
  AuthCredential,
  CatalogStatus,
  Category,
  Collection,
  CustomerProfile,
  MeasurementProfile,
  MediaAsset,
  Order,
  PasswordResetToken,
  Product,
  User,
} from "@/types/domain";
import {
  ADMIN_SEARCH_FIELDS,
  type CatalogFacets,
  type CategoryQuery,
  type CollectionQuery,
  type ListParams,
  type Paged,
  type ProductQuery,
  type ProductSort,
  type Repositories,
} from "@/server/data/repositories";

/**
 * Store-backed repositories shared by the memory and file providers.
 * A provider supplies the store object plus a `persist` callback invoked
 * after every mutation (no-op for memory, JSON write for file).
 */

/** Bump when the persisted shape changes; add a step to `migrateStore`. */
export const STORE_VERSION = 2;

export interface DataStore {
  version: number;
  products: Product[];
  categories: Category[];
  collections: Collection[];
  mediaAssets: MediaAsset[];
  orders: Order[];
  appointments: Appointment[];
  users: User[];
  credentials: AuthCredential[];
  customerProfiles: CustomerProfile[];
  measurementProfiles: MeasurementProfile[];
  passwordResetTokens: PasswordResetToken[];
}

export function emptyStore(): DataStore {
  return {
    version: STORE_VERSION,
    products: [],
    categories: [],
    collections: [],
    mediaAssets: [],
    orders: [],
    appointments: [],
    users: [],
    credentials: [],
    customerProfiles: [],
    measurementProfiles: [],
    passwordResetTokens: [],
  };
}

/**
 * Upgrade a persisted store to the current version.
 * Returns null when the file is too new or unrecognisable — callers then
 * preserve the file untouched instead of overwriting it.
 *
 * IMPORTANT: identity/customer collections are carried across untouched so
 * an upgrade never costs accounts, addresses or measurements.
 */
/** Every collection key that must be an array in a valid store file. */
const STORE_COLLECTION_KEYS = [
  "products",
  "categories",
  "collections",
  "mediaAssets",
  "orders",
  "appointments",
  "users",
  "credentials",
  "customerProfiles",
  "measurementProfiles",
  "passwordResetTokens",
] as const;

export function migrateStore(raw: unknown): DataStore | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<DataStore> & { version?: number };
  if (typeof input.version !== "number") return null;
  if (input.version > STORE_VERSION) return null; // written by a newer build

  // Shape check: a present-but-malformed collection must fail the guard here
  // (where the caller can still back the file up), not at request time.
  for (const key of STORE_COLLECTION_KEYS) {
    const value = input[key];
    if (value !== undefined && !Array.isArray(value)) return null;
  }

  const store: DataStore = { ...emptyStore(), ...(raw as DataStore) };

  // v1 → v2: catalog gained status/media/collections. v1 catalog rows used
  // `isActive` and an incompatible product shape; the catalog was empty by
  // design in phases 1–3, so anything present is mapped best-effort and
  // parked as a draft rather than silently published.
  if (input.version < 2) {
    const legacyCategories = (input.categories ?? []) as Array<
      Category & { isActive?: boolean }
    >;
    // Legacy rows arrive as drafts — an upgrade must never publish anything
    // to the storefront on the admin's behalf.
    store.categories = legacyCategories.map((category) => ({
      ...category,
      status: "draft" as const,
      sortOrder: category.sortOrder ?? 0,
    }));

    const legacyProducts = (input.products ?? []) as Array<
      Partial<Product> & { isActive?: boolean }
    >;
    store.products = legacyProducts.map((product, index) => ({
      id: product.id ?? `legacy-${index}`,
      sku: product.sku ?? `LEGACY-${index + 1}`,
      slug: product.slug ?? `legacy-${index + 1}`,
      name: product.name ?? "Untitled product",
      description: product.description ?? "",
      shortDescription: product.shortDescription,
      categoryId: product.categoryId,
      secondaryCategoryIds: product.secondaryCategoryIds ?? [],
      collectionIds: product.collectionIds ?? [],
      tags: product.tags ?? [],
      price: product.price ?? { amount: 0, currency: "INR" },
      salePrice: product.salePrice,
      status: "draft",
      availability: product.availability ?? "made_to_order",
      isFeatured: product.isFeatured ?? false,
      attributes: product.attributes ?? {},
      stitchingAvailable: product.stitchingAvailable ?? false,
      customizationAvailable: product.customizationAvailable ?? false,
      media: product.media ?? [],
      createdAt: product.createdAt ?? new Date(0).toISOString(),
      updatedAt: product.updatedAt ?? new Date(0).toISOString(),
    }));

    store.collections = (input.collections ?? []).map((collection) => ({
      ...collection,
      status: "draft" as const,
      sortOrder: collection.sortOrder ?? 0,
    }));
    store.mediaAssets = input.mediaAssets ?? [];
  }

  store.version = STORE_VERSION;
  return store;
}

function paginate<T>(rows: T[], params?: ListParams): T[] {
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  return rows.slice(offset, offset + limit);
}

/** Filter → sort → slice, returning the page plus the total match count. */
function page<T>(rows: T[], params?: ListParams): Paged<T> {
  return { rows: paginate(rows, params), total: rows.length };
}

function matchesText(haystacks: Array<string | undefined>, needle: string) {
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
function productMatches(product: Product, query: ProductQuery): boolean {
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

function sortProducts(rows: Product[], sort: ProductSort | undefined) {
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

export function createStoreRepositories(
  store: DataStore,
  persist: () => Promise<void>,
): Repositories {
  /**
   * Persist a mutation, undoing the in-memory change if the write fails —
   * otherwise a failed save would still be visible to the app (and would
   * become durable on the next unrelated write). A database provider
   * replaces this with a transaction.
   */
  async function persistOrRollback(rollback: () => void): Promise<void> {
    try {
      await persist();
    } catch (error) {
      rollback();
      throw error;
    }
  }

  async function insert<T>(list: T[], item: T): Promise<T> {
    list.push(item);
    await persistOrRollback(() => {
      const index = list.lastIndexOf(item);
      if (index !== -1) list.splice(index, 1);
    });
    return item;
  }

  async function replace<T extends { id: string }>(
    list: T[],
    item: T,
    label: string,
  ): Promise<T> {
    const index = list.findIndex((row) => row.id === item.id);
    if (index === -1) throw new Error(`${label} not found: ${item.id}`);
    const previous = list[index];
    list[index] = item;
    await persistOrRollback(() => {
      list[index] = previous;
    });
    return item;
  }

  async function remove<T extends { id: string }>(
    list: T[],
    id: string,
  ): Promise<void> {
    const index = list.findIndex((row) => row.id === id);
    if (index === -1) return;
    const [removed] = list.splice(index, 1);
    await persistOrRollback(() => {
      list.splice(index, 0, removed);
    });
  }

  return {
    products: {
      async query(query = {}) {
        const rows = store.products.filter((p) => productMatches(p, query));
        return page(sortProducts(rows, query.sort), query);
      },
      async facets(query = {}) {
        // Same predicate as `query`, so options always match what a search
        // would actually return.
        const rows = store.products.filter((p) => productMatches(p, query));

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
        const facets: CatalogFacets = {
          fabrics: distinct((p) => p.attributes.fabric),
          colours: distinct((p) => p.attributes.colour),
          occasions: distinct((p) => p.attributes.occasion),
          works: distinct((p) => p.attributes.work),
          availabilities: Array.from(
            new Set(rows.map((p) => p.availability)),
          ).sort(),
          priceRange: prices.length
            ? { min: Math.min(...prices), max: Math.max(...prices) }
            : null,
        };
        return facets;
      },
      async list(params) {
        return paginate(
          store.products.filter((p) => p.status === "published"),
          params,
        );
      },
      async getById(id) {
        return store.products.find((p) => p.id === id) ?? null;
      },
      async getBySlug(slug) {
        return store.products.find((p) => p.slug === slug) ?? null;
      },
      async getBySku(sku) {
        const normalized = sku.trim().toUpperCase();
        return (
          store.products.find((p) => p.sku.toUpperCase() === normalized) ?? null
        );
      },
      async create(product) {
        return insert(store.products, product);
      },
      async update(product) {
        return replace(store.products, product, "Product");
      },
      async countActive() {
        return store.products.filter((p) => p.status === "published").length;
      },
      async countByStatus() {
        const counts: Record<CatalogStatus, number> = {
          draft: 0,
          published: 0,
          archived: 0,
        };
        for (const product of store.products) counts[product.status]++;
        return counts;
      },
    },

    categories: {
      async list() {
        return store.categories
          .filter((c) => c.status === "published")
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      },
      async query(query: CategoryQuery = {}) {
        let rows = store.categories;
        if (query.excludeArchived) {
          rows = rows.filter((c) => c.status !== "archived");
        }
        if (query.status) rows = rows.filter((c) => c.status === query.status);
        if (query.search) {
          const term = query.search;
          rows = rows.filter((c) => matchesText([c.name, c.slug], term));
        }
        const sorted = [...rows].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
        return page(sorted, query);
      },
      async getById(id) {
        return store.categories.find((c) => c.id === id) ?? null;
      },
      async getBySlug(slug) {
        return store.categories.find((c) => c.slug === slug) ?? null;
      },
      async create(category) {
        return insert(store.categories, category);
      },
      async update(category) {
        return replace(store.categories, category, "Category");
      },
      async count() {
        return store.categories.filter((c) => c.status !== "archived").length;
      },
    },

    collections: {
      async list() {
        return store.collections
          .filter((c) => c.status === "published")
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      },
      async query(query: CollectionQuery = {}) {
        let rows = store.collections;
        if (query.excludeArchived) {
          rows = rows.filter((c) => c.status !== "archived");
        }
        if (query.status) rows = rows.filter((c) => c.status === query.status);
        if (query.search) {
          const term = query.search;
          rows = rows.filter((c) => matchesText([c.name, c.slug], term));
        }
        const sorted = [...rows].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
        return page(sorted, query);
      },
      async getById(id) {
        return store.collections.find((c) => c.id === id) ?? null;
      },
      async getBySlug(slug) {
        return store.collections.find((c) => c.slug === slug) ?? null;
      },
      async create(collection) {
        return insert(store.collections, collection);
      },
      async update(collection) {
        return replace(store.collections, collection, "Collection");
      },
      async count() {
        return store.collections.filter((c) => c.status !== "archived").length;
      },
    },

    media: {
      async getById(id) {
        return store.mediaAssets.find((m) => m.id === id) ?? null;
      },
      async listByIds(ids) {
        const wanted = new Set(ids);
        return store.mediaAssets.filter((m) => wanted.has(m.id));
      },
      async create(asset) {
        return insert(store.mediaAssets, asset);
      },
      async delete(id) {
        await remove(store.mediaAssets, id);
      },
    },

    orders: {
      async list(params) {
        return paginate(store.orders, params);
      },
      async getById(id) {
        return store.orders.find((o) => o.id === id) ?? null;
      },
      async count() {
        return store.orders.length;
      },
      async countByStatus() {
        const counts: Record<string, number> = {};
        for (const order of store.orders) {
          counts[order.status] = (counts[order.status] ?? 0) + 1;
        }
        return counts;
      },
    },

    appointments: {
      async list(params) {
        return paginate(store.appointments, params);
      },
      async count() {
        return store.appointments.length;
      },
    },

    users: {
      async getById(id) {
        return store.users.find((u) => u.id === id) ?? null;
      },
      async findByEmail(email) {
        const normalized = email.trim().toLowerCase();
        return (
          store.users.find(
            (u) => u.email?.toLowerCase() === normalized,
          ) ?? null
        );
      },
      async create(user) {
        return insert(store.users, user);
      },
      async update(user) {
        return replace(store.users, user, "User");
      },
    },

    credentials: {
      async getByUserId(userId) {
        return store.credentials.find((c) => c.userId === userId) ?? null;
      },
      async create(credential) {
        return insert(store.credentials, credential);
      },
      async update(credential) {
        return replace(store.credentials, credential, "Credential");
      },
    },

    customers: {
      async getByUserId(userId) {
        return (
          store.customerProfiles.find((p) => p.userId === userId) ?? null
        );
      },
      async create(profile) {
        return insert(store.customerProfiles, profile);
      },
      async update(profile) {
        return replace(store.customerProfiles, profile, "Customer profile");
      },
      async list(params) {
        return paginate(store.customerProfiles, params);
      },
      async count() {
        return store.customerProfiles.length;
      },
    },

    measurementProfiles: {
      async listByCustomerId(customerId) {
        return store.measurementProfiles.filter(
          (m) => m.customerId === customerId && !m.archivedAt,
        );
      },
      async getById(id) {
        return store.measurementProfiles.find((m) => m.id === id) ?? null;
      },
      async create(profile) {
        return insert(store.measurementProfiles, profile);
      },
      async update(profile) {
        return replace(store.measurementProfiles, profile, "Measurement profile");
      },
    },

    passwordResetTokens: {
      async create(token) {
        return insert(store.passwordResetTokens, token);
      },
      async findValidByHash(tokenHash) {
        const now = Date.now();
        return (
          store.passwordResetTokens.find(
            (t) =>
              t.tokenHash === tokenHash &&
              !t.usedAt &&
              Date.parse(t.expiresAt) > now,
          ) ?? null
        );
      },
      async markUsed(id) {
        const token = store.passwordResetTokens.find((t) => t.id === id);
        if (!token) return;
        const previous = token.usedAt;
        token.usedAt = new Date().toISOString();
        await persistOrRollback(() => {
          token.usedAt = previous;
        });
      },
    },
  };
}
