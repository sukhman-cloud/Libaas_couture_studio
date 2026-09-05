import "server-only";
import type {
  AdminUser,
  Appointment,
  AuthCredential,
  Cart,
  CatalogStatus,
  Category,
  Collection,
  CustomerProfile,
  CustomizationRequest,
  CustomizationActivity,
  CustomizationNote,
  ID,
  InventoryItem,
  InventoryMovement,
  MeasurementProfile,
  MediaAsset,
  Order,
  OrderActivity,
  OrderNote,
  PasswordResetToken,
  Payment,
  PaymentActivity,
  PaymentAttempt,
  PaymentWebhookEvent,
  Product,
  Role,
  RoleName,
  Shipment,
  ShipmentActivity,
  ShipmentWebhookEvent,
  User,
  Wishlist,
} from "@/types/domain";
import {
  type CategoryQuery,
  type CollectionQuery,
  type Repositories,
  type StoreRepositories,
} from "@/server/data/repositories";
import {
  computeProductFacets,
  page,
  paginate,
  productMatches,
  publishedInOrder,
  queryCategories,
  queryCollections,
  queryCustomers,
  queryOrders,
  sortProducts,
} from "@/server/data/catalog-logic";
import { withLock } from "@/server/lock";
import { rolePermissions } from "@/lib/auth/roles";

/**
 * Store-backed repositories shared by the memory and file providers.
 * A provider supplies the store object plus a `persist` callback invoked
 * after every mutation (no-op for memory, JSON write for file).
 */

/** Bump when the persisted shape changes; add a step to `migrateStore`. */
export const STORE_VERSION = 11;

/**
 * Fixed reference rows — identical ids/permissions to the Postgres
 * migration's seed data (prisma/migrations/*_admin_accounts_phase_14), so
 * an admin's role assignment means the same thing under either provider.
 */
function seedRoles(): Role[] {
  const now = new Date(0).toISOString();
  const ids: Record<RoleName, string> = {
    owner: "role-owner",
    manager: "role-manager",
    tailor: "role-tailor",
    staff: "role-staff",
  };
  return (Object.keys(rolePermissions) as RoleName[]).map((name) => ({
    id: ids[name],
    name,
    permissions: [...rolePermissions[name]],
    createdAt: now,
    updatedAt: now,
  }));
}

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
  roles: Role[];
  adminUsers: AdminUser[];
  customerProfiles: CustomerProfile[];
  measurementProfiles: MeasurementProfile[];
  passwordResetTokens: PasswordResetToken[];
  carts: Cart[];
  wishlists: Wishlist[];
  customizationRequests: CustomizationRequest[];
  orderActivities: OrderActivity[];
  orderNotes: OrderNote[];
  payments: Payment[];
  paymentAttempts: PaymentAttempt[];
  paymentActivities: PaymentActivity[];
  paymentWebhookEvents: PaymentWebhookEvent[];
  customizationActivities: CustomizationActivity[];
  customizationNotes: CustomizationNote[];
  shipments: Shipment[];
  shipmentActivities: ShipmentActivity[];
  shipmentWebhookEvents: ShipmentWebhookEvent[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
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
    roles: seedRoles(),
    adminUsers: [],
    customerProfiles: [],
    measurementProfiles: [],
    passwordResetTokens: [],
    carts: [],
    wishlists: [],
    customizationRequests: [],
    orderActivities: [],
    orderNotes: [],
    payments: [],
    paymentAttempts: [],
    paymentActivities: [],
    paymentWebhookEvents: [],
    customizationActivities: [],
    customizationNotes: [],
    shipments: [],
    shipmentActivities: [],
    shipmentWebhookEvents: [],
    inventoryItems: [],
    inventoryMovements: [],
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
  "roles",
  "adminUsers",
  "customerProfiles",
  "measurementProfiles",
  "passwordResetTokens",
  "carts",
  "wishlists",
  "customizationRequests",
  "orderActivities",
  "orderNotes",
  "payments",
  "paymentAttempts",
  "paymentActivities",
  "paymentWebhookEvents",
  "customizationActivities",
  "customizationNotes",
  "shipments",
  "shipmentActivities",
  "shipmentWebhookEvents",
  "inventoryItems",
  "inventoryMovements",
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

  // v2 → v3: carts and wishlists were introduced. Nothing to convert —
  // emptyStore() supplies the new collections and every existing record
  // (accounts, catalog, media) carries over untouched.

  // v3 → v4: `customerId` renamed to `userId` on carts, wishlists and
  // measurement profiles. This is a RENAME ONLY — the value was already the
  // owning User's id, despite the old name. No id is regenerated, no row is
  // dropped, and a row that somehow carries both keeps `userId`.
  if (input.version < 4) {
    const renameOwner = <T extends { userId?: ID; customerId?: ID }>(
      rows: T[],
    ): T[] =>
      rows.map((row) => {
        if (row.userId !== undefined) return row;
        const { customerId, ...rest } = row as T & { customerId?: ID };
        return { ...rest, userId: customerId } as T;
      });

    store.carts = renameOwner(
      (input.carts ?? []) as Array<Cart & { customerId?: ID }>,
    );
    store.wishlists = renameOwner(
      (input.wishlists ?? []) as Array<Wishlist & { customerId?: ID }>,
    );
    store.measurementProfiles = renameOwner(
      (input.measurementProfiles ?? []) as Array<
        MeasurementProfile & { customerId?: ID }
      >,
    );
  }

  // v4 → v5: customizationRequests introduced (Phase 7B foundation).
  // Nothing to convert — emptyStore() supplies the empty collection and
  // every existing record carries over untouched.

  // v5 → v6: append-only order activity and private note collections.
  // v6 → v7: customization workflow activity and private notes.
  // v7 → v8: payments, payment attempts, payment activities, payment
  // webhook events (Phase 10 foundation).
  // v8 → v9: shipments, shipment activities, shipment webhook events
  // (Phase 11 foundation). Nothing to convert — emptyStore() supplies all
  // three collections and every existing order remains a valid historical
  // record with no shipment attached (read paths treat that honestly).
  // v9 → v10: inventory items + inventory movements (Phase 13 foundation).
  // Nothing to convert — emptyStore() supplies both empty collections, and
  // every existing product simply has NO inventory row, which reads as
  // trackingEnabled: false (availability governed by the existing
  // ProductAvailability enum alone, unchanged from before this phase).
  // v10 → v11: real admin accounts (Phase 14). `roles` did not exist in any
  // older file, so the key is absent (not merely empty) on `raw` and the
  // FIRST spread's seeded roles survive untouched — no legacy row to carry
  // over. `adminUsers` starts empty for every upgraded store: an operator
  // must run the bootstrap script once to create the first owner, exactly
  // like a brand-new store would.

  store.version = STORE_VERSION;
  return store;
}

/**
 * Every write is serialized on one process-wide key so a transaction can
 * hold the store steady while it runs. Domain locks (`customer:<id>`,
 * `catalog`) are always taken FIRST and this one last, which is what keeps
 * the ordering acyclic — see the deadlock rule on `Repositories.transaction`.
 */
const STORE_LOCK = "store:write";

/**
 * How a mutation reaches the store. Ordinary repositories take the store
 * lock; repositories handed to a transaction callback do not, because the
 * transaction already holds it (re-entering would deadlock).
 */
type Guard = <T>(task: () => Promise<T>) => Promise<T>;

const lockedGuard: Guard = (task) => withLock(STORE_LOCK, task);
const passthroughGuard: Guard = (task) => task();

function buildStoreRepositories(
  store: DataStore,
  persist: () => Promise<void>,
  guard: Guard,
): StoreRepositories {
  /**
   * Persist a mutation, undoing the in-memory change if the write fails —
   * otherwise a failed save would still be visible to the app (and would
   * become durable on the next unrelated write). Inside a transaction
   * `persist` is a no-op, so the whole unit is written once at commit.
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
    return guard(async () => {
      list.push(item);
      await persistOrRollback(() => {
        const index = list.lastIndexOf(item);
        if (index !== -1) list.splice(index, 1);
      });
      return item;
    });
  }

  /**
   * Swap a row for a new version of itself.
   *
   * `precondition` runs against the CURRENT row while the store lock is
   * held, so an invariant it enforces cannot be raced: the check and the
   * write are one critical section. Throwing from it aborts the write (and,
   * inside a transaction, rolls the whole unit back).
   */
  async function replace<T extends { id: string }>(
    list: T[],
    item: T,
    label: string,
    precondition?: (current: T) => void,
  ): Promise<T> {
    return guard(async () => {
      const index = list.findIndex((row) => row.id === item.id);
      if (index === -1) throw new Error(`${label} not found: ${item.id}`);
      const previous = list[index];
      precondition?.(previous);
      list[index] = item;
      await persistOrRollback(() => {
        list[index] = previous;
      });
      return item;
    });
  }

  async function remove<T extends { id: string }>(
    list: T[],
    id: string,
  ): Promise<void> {
    return guard(async () => {
      const index = list.findIndex((row) => row.id === id);
      if (index === -1) return;
      const [removed] = list.splice(index, 1);
      await persistOrRollback(() => {
        list.splice(index, 0, removed);
      });
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
        return computeProductFacets(rows);
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
        return publishedInOrder(store.categories);
      },
      async query(query: CategoryQuery = {}) {
        return queryCategories(store.categories, query);
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
        return publishedInOrder(store.collections);
      },
      async query(query: CollectionQuery = {}) {
        return queryCollections(store.collections, query);
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
      async getByOrderNumber(orderNumber) {
        return store.orders.find((o) => o.orderNumber === orderNumber) ?? null;
      },
      async getByIdempotencyKey(userId, idempotencyKey) {
        return (
          store.orders.find(
            (o) => o.userId === userId && o.idempotencyKey === idempotencyKey,
          ) ?? null
        );
      },
      async listByUserId(userId, params) {
        const mine = store.orders
          .filter((o) => o.userId === userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(mine, params);
      },
      async query(params) {
        return queryOrders(store.orders, params);
      },
      async create(order) {
        // Uniqueness enforced INSIDE the guarded section, so the check and
        // the insert are one critical section (mirrors the database
        // constraints the Prisma provider gets for free).
        return guard(async () => {
          if (store.orders.some((o) => o.orderNumber === order.orderNumber)) {
            throw new Error(
              `Order number already exists: ${order.orderNumber}`,
            );
          }
          if (
            store.orders.some(
              (o) =>
                o.userId === order.userId &&
                o.idempotencyKey === order.idempotencyKey,
            )
          ) {
            throw new Error(
              "Duplicate idempotency key: an order for this confirmation already exists.",
            );
          }
          store.orders.push(order);
          await persistOrRollback(() => {
            const index = store.orders.lastIndexOf(order);
            if (index !== -1) store.orders.splice(index, 1);
          });
          return order;
        });
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
      async transitionStatus(orderId, expectedStatus, nextStatus, updatedAt) {
        return guard(async () => {
          const order = store.orders.find((candidate) => candidate.id === orderId);
          if (!order || order.status !== expectedStatus) return null;
          order.status = nextStatus;
          order.updatedAt = updatedAt;
          return order;
        });
      },
    },

    orderActivities: {
      async listByOrderId(orderId) {
        return store.orderActivities
          .filter((activity) => activity.orderId === orderId)
          .sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          );
      },
      async create(activity) {
        return insert(store.orderActivities, activity);
      },
      async listRecent(limit) {
        return [...store.orderActivities]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .slice(0, limit);
      },
    },

    orderNotes: {
      async listByOrderId(orderId) {
        return store.orderNotes
          .filter((note) => note.orderId === orderId)
          .sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          );
      },
      async create(note) {
        return insert(store.orderNotes, note);
      },
    },

    payments: {
      async getById(id) {
        return store.payments.find((payment) => payment.id === id) ?? null;
      },
      async getByOrderId(orderId) {
        return store.payments.find((payment) => payment.orderId === orderId) ?? null;
      },
      async listByOrderIds(orderIds) {
        const wanted = new Set(orderIds);
        return store.payments.filter((payment) => wanted.has(payment.orderId));
      },
      async list() {
        return [...store.payments];
      },
      async create(payment) {
        return guard(async () => {
          if (store.payments.some((row) => row.orderId === payment.orderId)) {
            throw new Error(`Payment already exists for order: ${payment.orderId}`);
          }
          store.payments.push(payment);
          await persistOrRollback(() => {
            const index = store.payments.lastIndexOf(payment);
            if (index !== -1) store.payments.splice(index, 1);
          });
          return payment;
        });
      },
      async update(payment) {
        return replace(store.payments, payment, "Payment");
      },
      async transitionStatus(paymentId, expectedStatus, nextStatus, updatedAt) {
        return guard(async () => {
          const payment = store.payments.find((row) => row.id === paymentId);
          if (!payment || payment.status !== expectedStatus) return null;
          payment.status = nextStatus;
          payment.updatedAt = updatedAt;
          return payment;
        });
      },
    },

    paymentAttempts: {
      async listByPaymentId(paymentId) {
        return store.paymentAttempts
          .filter((attempt) => attempt.paymentId === paymentId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async getByIdempotencyKey(paymentId, idempotencyKey) {
        return (
          store.paymentAttempts.find(
            (attempt) =>
              attempt.paymentId === paymentId &&
              attempt.idempotencyKey === idempotencyKey,
          ) ?? null
        );
      },
      async create(attempt) {
        return guard(async () => {
          if (
            store.paymentAttempts.some(
              (row) =>
                row.paymentId === attempt.paymentId &&
                row.idempotencyKey === attempt.idempotencyKey,
            )
          ) {
            throw new Error("Duplicate payment attempt idempotency key.");
          }
          store.paymentAttempts.push(attempt);
          await persistOrRollback(() => {
            const index = store.paymentAttempts.lastIndexOf(attempt);
            if (index !== -1) store.paymentAttempts.splice(index, 1);
          });
          return attempt;
        });
      },
      async update(attempt) {
        return replace(store.paymentAttempts, attempt, "Payment attempt");
      },
    },

    paymentActivities: {
      async listByPaymentId(paymentId) {
        return store.paymentActivities
          .filter((activity) => activity.paymentId === paymentId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async create(activity) {
        return insert(store.paymentActivities, activity);
      },
      async listRecent(limit) {
        return [...store.paymentActivities]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .slice(0, limit);
      },
    },

    paymentWebhookEvents: {
      async getByProviderEvent(provider, providerEventId) {
        return (
          store.paymentWebhookEvents.find(
            (event) =>
              event.provider === provider &&
              event.providerEventId === providerEventId,
          ) ?? null
        );
      },
      async create(event) {
        return guard(async () => {
          if (
            store.paymentWebhookEvents.some(
              (row) =>
                row.provider === event.provider &&
                row.providerEventId === event.providerEventId,
            )
          ) {
            throw new Error("Duplicate payment webhook event.");
          }
          store.paymentWebhookEvents.push(event);
          await persistOrRollback(() => {
            const index = store.paymentWebhookEvents.lastIndexOf(event);
            if (index !== -1) store.paymentWebhookEvents.splice(index, 1);
          });
          return event;
        });
      },
      async markProcessed(id, processedAt, paymentId, orderId) {
        return guard(async () => {
          const event = store.paymentWebhookEvents.find((row) => row.id === id);
          if (!event) return null;
          event.processedAt = processedAt;
          event.updatedAt = processedAt;
          if (paymentId) event.paymentId = paymentId;
          if (orderId) event.orderId = orderId;
          return event;
        });
      },
    },

    shipments: {
      async getById(id) {
        return store.shipments.find((shipment) => shipment.id === id) ?? null;
      },
      async getByOrderId(orderId) {
        return store.shipments.find((shipment) => shipment.orderId === orderId) ?? null;
      },
      async listByOrderIds(orderIds) {
        const wanted = new Set(orderIds);
        return store.shipments.filter((shipment) => wanted.has(shipment.orderId));
      },
      async create(shipment) {
        return guard(async () => {
          if (store.shipments.some((row) => row.orderId === shipment.orderId)) {
            throw new Error(`Shipment already exists for order: ${shipment.orderId}`);
          }
          store.shipments.push(shipment);
          await persistOrRollback(() => {
            const index = store.shipments.lastIndexOf(shipment);
            if (index !== -1) store.shipments.splice(index, 1);
          });
          return shipment;
        });
      },
      async update(shipment) {
        return replace(store.shipments, shipment, "Shipment");
      },
      async transitionStatus(shipmentId, expectedStatus, nextStatus, updatedAt) {
        return guard(async () => {
          const shipment = store.shipments.find((row) => row.id === shipmentId);
          if (!shipment || shipment.status !== expectedStatus) return null;
          shipment.status = nextStatus;
          shipment.updatedAt = updatedAt;
          return shipment;
        });
      },
    },

    shipmentActivities: {
      async listByShipmentId(shipmentId) {
        return store.shipmentActivities
          .filter((activity) => activity.shipmentId === shipmentId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async create(activity) {
        return insert(store.shipmentActivities, activity);
      },
      async listRecent(limit) {
        return [...store.shipmentActivities]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .slice(0, limit);
      },
    },

    shipmentWebhookEvents: {
      async getByProviderEvent(carrier, providerEventId) {
        return (
          store.shipmentWebhookEvents.find(
            (event) => event.carrier === carrier && event.providerEventId === providerEventId,
          ) ?? null
        );
      },
      async create(event) {
        return guard(async () => {
          if (
            store.shipmentWebhookEvents.some(
              (row) => row.carrier === event.carrier && row.providerEventId === event.providerEventId,
            )
          ) {
            throw new Error("Duplicate shipment webhook event.");
          }
          store.shipmentWebhookEvents.push(event);
          await persistOrRollback(() => {
            const index = store.shipmentWebhookEvents.lastIndexOf(event);
            if (index !== -1) store.shipmentWebhookEvents.splice(index, 1);
          });
          return event;
        });
      },
      async markProcessed(id, processedAt, shipmentId, orderId) {
        return guard(async () => {
          const event = store.shipmentWebhookEvents.find((row) => row.id === id);
          if (!event) return null;
          event.processedAt = processedAt;
          event.updatedAt = processedAt;
          if (shipmentId) event.shipmentId = shipmentId;
          if (orderId) event.orderId = orderId;
          return event;
        });
      },
    },

    inventoryItems: {
      async getById(id) {
        return store.inventoryItems.find((item) => item.id === id) ?? null;
      },
      async getByProductId(productId) {
        return store.inventoryItems.find((item) => item.productId === productId) ?? null;
      },
      async listByProductIds(productIds) {
        const wanted = new Set(productIds);
        return store.inventoryItems.filter((item) => wanted.has(item.productId));
      },
      async query(params = {}) {
        const search = params.search?.trim().toLowerCase();
        const productsById = new Map(store.products.map((p) => [p.id, p]));
        let rows = store.inventoryItems.filter((item) => {
          const product = productsById.get(item.productId);
          if (!product) return false;
          if (params.trackingEnabledOnly && !item.trackingEnabled) return false;
          if (search) {
            const haystack = `${product.name} ${product.sku}`.toLowerCase();
            if (!haystack.includes(search)) return false;
          }
          const available = item.quantityOnHand - item.quantityReserved;
          if (params.outOfStockOnly && !(item.trackingEnabled && available <= 0)) return false;
          if (
            params.lowStockOnly &&
            !(item.trackingEnabled && available > 0 && available <= item.lowStockThreshold)
          ) {
            return false;
          }
          return true;
        });
        rows = rows.sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1);
        return page(rows, params);
      },
      async create(item) {
        return guard(async () => {
          if (store.inventoryItems.some((row) => row.productId === item.productId)) {
            throw new Error(`Inventory item already exists for product: ${item.productId}`);
          }
          store.inventoryItems.push(item);
          await persistOrRollback(() => {
            const index = store.inventoryItems.lastIndexOf(item);
            if (index !== -1) store.inventoryItems.splice(index, 1);
          });
          return item;
        });
      },
      async update(item) {
        return replace(store.inventoryItems, item, "Inventory item");
      },
      async adjustOnHand(inventoryItemId, delta, expected) {
        return guard(async () => {
          const item = store.inventoryItems.find((row) => row.id === inventoryItemId);
          if (!item) return null;
          if (
            item.quantityOnHand !== expected.quantityOnHand ||
            item.quantityReserved !== expected.quantityReserved
          ) {
            return null;
          }
          const nextOnHand = item.quantityOnHand + delta;
          if (nextOnHand < 0 || nextOnHand < item.quantityReserved) return null;
          item.quantityOnHand = nextOnHand;
          item.updatedAt = new Date().toISOString();
          return item;
        });
      },
      async adjustReserved(inventoryItemId, delta, expected) {
        return guard(async () => {
          const item = store.inventoryItems.find((row) => row.id === inventoryItemId);
          if (!item) return null;
          if (
            item.quantityOnHand !== expected.quantityOnHand ||
            item.quantityReserved !== expected.quantityReserved
          ) {
            return null;
          }
          const nextReserved = item.quantityReserved + delta;
          if (nextReserved < 0 || nextReserved > item.quantityOnHand) return null;
          item.quantityReserved = nextReserved;
          item.updatedAt = new Date().toISOString();
          return item;
        });
      },
    },

    inventoryMovements: {
      async listByInventoryItemId(inventoryItemId, params) {
        const rows = store.inventoryMovements
          .filter((movement) => movement.inventoryItemId === inventoryItemId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        return paginate(rows, params);
      },
      async listByOrderId(orderId) {
        return store.inventoryMovements
          .filter((movement) => movement.orderId === orderId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async getByIdempotencyKey(inventoryItemId, idempotencyKey) {
        return (
          store.inventoryMovements.find(
            (movement) =>
              movement.inventoryItemId === inventoryItemId &&
              movement.idempotencyKey === idempotencyKey,
          ) ?? null
        );
      },
      async create(movement) {
        return guard(async () => {
          if (
            movement.idempotencyKey &&
            store.inventoryMovements.some(
              (row) =>
                row.inventoryItemId === movement.inventoryItemId &&
                row.idempotencyKey === movement.idempotencyKey,
            )
          ) {
            throw new Error("Duplicate inventory movement idempotency key.");
          }
          store.inventoryMovements.push(movement);
          await persistOrRollback(() => {
            const index = store.inventoryMovements.lastIndexOf(movement);
            if (index !== -1) store.inventoryMovements.splice(index, 1);
          });
          return movement;
        });
      },
      async listRecent(limit) {
        return [...store.inventoryMovements]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .slice(0, limit);
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
      async queryCustomers(params) {
        const customers = store.users.filter((u) => u.kind === "customer");
        return queryCustomers(customers, params);
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
        // sessionVersion is monotonic BY DEFINITION: it only ever counts up,
        // and every session token carries the version it was minted with.
        // Writing a lower one would silently revalidate sessions that a
        // password change, reset or deactivation had already killed, so it
        // is rejected at the storage seam rather than trusted to every
        // caller — present and future — getting the arithmetic right.
        return replace(
          store.credentials,
          credential,
          "Credential",
          (current) => {
            if (credential.sessionVersion < current.sessionVersion) {
              throw new Error(
                `Credential ${credential.id}: sessionVersion cannot move backwards (${current.sessionVersion} -> ${credential.sessionVersion}).`,
              );
            }
          },
        );
      },
    },

    roles: {
      async list() {
        return [...store.roles];
      },
      async getById(id) {
        return store.roles.find((r) => r.id === id) ?? null;
      },
      async getByName(name) {
        return store.roles.find((r) => r.name === name) ?? null;
      },
    },

    adminUsers: {
      async getByUserId(userId) {
        return store.adminUsers.find((a) => a.userId === userId) ?? null;
      },
      async list() {
        return [...store.adminUsers];
      },
      async count() {
        return store.adminUsers.length;
      },
      async create(adminUser) {
        return insert(store.adminUsers, adminUser);
      },
      async update(adminUser) {
        return replace(store.adminUsers, adminUser, "Admin user");
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
      async listByUserId(userId) {
        return store.measurementProfiles.filter(
          (m) => m.userId === userId && !m.archivedAt,
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

    carts: {
      async getByUserId(userId) {
        return store.carts.find((c) => c.userId === userId) ?? null;
      },
      async create(cart) {
        return insert(store.carts, cart);
      },
      async update(cart) {
        return replace(store.carts, cart, "Cart");
      },
    },

    wishlists: {
      async getByUserId(userId) {
        return store.wishlists.find((w) => w.userId === userId) ?? null;
      },
      async create(wishlist) {
        return insert(store.wishlists, wishlist);
      },
      async update(wishlist) {
        return replace(store.wishlists, wishlist, "Wishlist");
      },
    },

    customizationRequests: {
      async getById(id) {
        return store.customizationRequests.find((r) => r.id === id) ?? null;
      },
      async list() {
        return [...store.customizationRequests];
      },
      async listByUserId(userId) {
        return store.customizationRequests
          .filter((r) => r.userId === userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async create(request) {
        return insert(store.customizationRequests, request);
      },
      async update(request) {
        return replace(
          store.customizationRequests,
          request,
          "Customization request",
        );
      },
      async transitionStatus(id, expected, next, updatedAt) {
        return guard(async () => {
          const request = store.customizationRequests.find((row) => row.id === id);
          if (!request || request.status !== expected) return null;
          request.status = next;
          request.updatedAt = updatedAt;
          return request;
        });
      },
    },

    customizationActivities: {
      async listByRequestId(requestId) {
        return store.customizationActivities
          .filter((row) => row.customizationRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async create(activity) {
        return insert(store.customizationActivities, activity);
      },
      async listRecent(limit) {
        return [...store.customizationActivities]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
          .slice(0, limit);
      },
    },

    customizationNotes: {
      async listByRequestId(requestId) {
        return store.customizationNotes
          .filter((row) => row.customizationRequestId === requestId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      },
      async create(note) {
        return insert(store.customizationNotes, note);
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
        return guard(async () => {
          const token = store.passwordResetTokens.find((t) => t.id === id);
          if (!token) return;
          const previous = token.usedAt;
          token.usedAt = new Date().toISOString();
          await persistOrRollback(() => {
            token.usedAt = previous;
          });
        });
      },
    },
  };
}

/** Deep copy of every collection, used as the transaction rollback point. */
function snapshotStore(store: DataStore): DataStore {
  return structuredClone(store);
}

/**
 * Restore a snapshot IN PLACE. The store object itself must survive, because
 * the file provider's `persist` closure captures that exact reference —
 * swapping in a fresh object would leave it writing a stale store.
 */
function restoreStore(store: DataStore, snapshot: DataStore): void {
  store.version = snapshot.version;
  for (const key of STORE_COLLECTION_KEYS) {
    const live = store[key] as unknown[];
    live.length = 0;
    live.push(...(snapshot[key] as unknown[]));
  }
}

export function createStoreRepositories(
  store: DataStore,
  persist: () => Promise<void>,
): Repositories {
  const base = buildStoreRepositories(store, persist, lockedGuard);

  async function transaction<T>(
    fn: (tx: StoreRepositories) => Promise<T>,
  ): Promise<T> {
    return withLock(STORE_LOCK, async () => {
      const snapshot = snapshotStore(store);

      // Inside the unit, writes mutate the store but never touch the disk;
      // one commit at the end turns the whole thing into a single atomic
      // file replace.
      let dirty = false;
      const buffered = buildStoreRepositories(
        store,
        async () => {
          dirty = true;
        },
        passthroughGuard,
      );

      let result: T;
      try {
        result = await fn(buffered);
      } catch (error) {
        restoreStore(store, snapshot);
        throw error;
      }

      if (dirty) {
        try {
          await persist();
        } catch (error) {
          // The commit failed, so nothing reached the disk. Undo the
          // in-memory changes too, or they would become durable on the
          // next unrelated write.
          restoreStore(store, snapshot);
          throw error;
        }
      }
      return result;
    });
  }

  return { ...base, transaction };
}
