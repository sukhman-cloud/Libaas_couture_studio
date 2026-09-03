import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  Repositories,
  StoreRepositories,
} from "@/server/data/repositories";
import {
  computeProductFacets,
  page,
  paginate,
  productMatches,
  publishedInOrder,
  queryCategories,
  queryCollections,
  queryOrders,
  sortProducts,
} from "@/server/data/catalog-logic";
import { getPrismaClient } from "@/server/data/postgres/client";
import {
  addressRows,
  CART_INCLUDE,
  ORDER_INCLUDE,
  orderColumns,
  orderItemRows,
  toOrder,
  toOrderActivity,
  toOrderNote,
  cartColumns,
  cartItemRows,
  categoryColumns,
  collectionColumns,
  collectionLinkRows,
  credentialColumns,
  customizationRequestColumns,
  MEASUREMENT_INCLUDE,
  measurementColumns,
  measurementValueRows,
  mediaAssetColumns,
  PRODUCT_INCLUDE,
  productColumns,
  productMediaRows,
  PROFILE_INCLUDE,
  profileColumns,
  resetTokenColumns,
  secondaryCategoryRows,
  toCart,
  toCategory,
  toCollection,
  toCredential,
  toCustomerProfile,
  toCustomizationRequest,
  toMeasurementProfile,
  toMediaAsset,
  toProduct,
  toResetToken,
  toUser,
  toWishlist,
  userColumns,
  WISHLIST_INCLUDE,
  wishlistColumns,
  wishlistItemRows,
} from "@/server/data/postgres/mappers";
import type { CatalogStatus } from "@/types/domain";

/**
 * PostgreSQL data provider (Phase 5D) — the same Repositories contract the
 * JSON and memory providers implement, backed by Prisma.
 *
 * DESIGN RULES
 *
 * - Catalog query/facet/sort semantics come from `catalog-logic` — the SAME
 *   pure functions the JSON provider runs. This provider loads rows and
 *   applies the shared predicates rather than re-encoding them in SQL, so a
 *   filter can never behave differently depending on the provider. At
 *   boutique catalog scale that is one indexed round trip; pushing filters
 *   into SQL is a later optimisation that must ship with parity tests.
 *
 * - Entities whose domain shape embeds arrays (product media/links,
 *   addresses, measurement values, cart/wishlist items) are written as
 *   "replace children": update the row, delete the child rows, recreate
 *   them from the array with their positions. `update()` receives the whole
 *   entity, so replacement is exact — and it happens inside a transaction
 *   (`runAtomic`) unless the caller already opened one.
 *
 * - Reads have NO application locks and open no transactions.
 *
 * - The JSON provider's corruption/backup/fail-closed machinery is
 *   deliberately absent here: durability, atomicity and recovery are the
 *   database's job (see the provider notes in docs/phase-5d-database.md).
 *
 * - `appointments` remains a read-only interface over data that does not
 *   exist yet (no Appointment tables — deferred). Orders became real
 *   tables in Phase 6C; order rows are immutable historical records, so
 *   the repository offers create + reads and nothing else.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Run `fn` atomically: reuse the ambient transaction when `db` already is
 *  one, otherwise open a fresh transaction on the root client. */
function runAtomic<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    // Same limits as repos.transaction(): a slow cloud round trip must not
    // abort a correct multi-statement write (Prisma defaults are 2s/5s).
    return (db as PrismaClient).$transaction(fn, {
      maxWait: 10_000,
      timeout: 30_000,
    });
  }
  return fn(db);
}

/** Prisma "record not found" (P2025) → the same error the JSON provider
 *  throws, so callers and tests see identical behavior. */
async function orNotFound<T>(
  task: Promise<T>,
  label: string,
  id: string,
): Promise<T> {
  try {
    return await task;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new Error(`${label} not found: ${id}`);
    }
    throw error;
  }
}

const extraJson = (extra: Record<string, string> | undefined) =>
  extra === undefined ? Prisma.DbNull : extra;

/**
 * Reads that assemble parent + child rows use the JOIN relation-load
 * strategy so the whole aggregate comes from ONE SQL statement — a
 * consistent MVCC snapshot. With the default (one query per relation) a
 * lock-free reader could observe a half-replaced child set mid-write;
 * the in-memory store never allowed that, and neither should this.
 */
const ATOMIC_READ = { relationLoadStrategy: "join" } as const;

function buildPostgresRepositories(db: Db): StoreRepositories {
  return {
    /* ── catalog: products ────────────────────────────────────────── */

    products: {
      async query(query = {}) {
        const rows = await db.product.findMany({
          ...ATOMIC_READ,
          include: PRODUCT_INCLUDE,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        const products = rows.map(toProduct);
        const matched = products.filter((p) => productMatches(p, query));
        return page(sortProducts(matched, query.sort), query);
      },
      async facets(query = {}) {
        const rows = await db.product.findMany({
          ...ATOMIC_READ,
          include: PRODUCT_INCLUDE,
        });
        const matched = rows
          .map(toProduct)
          .filter((p) => productMatches(p, query));
        return computeProductFacets(matched);
      },
      async list(params) {
        const rows = await db.product.findMany({
          ...ATOMIC_READ,
          where: { status: "published" },
          include: PRODUCT_INCLUDE,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return paginate(rows.map(toProduct), params);
      },
      async getById(id) {
        const row = await db.product.findUnique({
          ...ATOMIC_READ,
          where: { id },
          include: PRODUCT_INCLUDE,
        });
        return row ? toProduct(row) : null;
      },
      async getBySlug(slug) {
        const row = await db.product.findUnique({
          ...ATOMIC_READ,
          where: { slug },
          include: PRODUCT_INCLUDE,
        });
        return row ? toProduct(row) : null;
      },
      async getBySku(sku) {
        // SKUs are stored uppercase (normalized at the validation boundary),
        // so uppercasing the argument gives the JSON provider's
        // case-insensitive behavior as an EXACT indexed match. Deliberately
        // not Prisma's `mode: "insensitive"`: that compiles to ILIKE without
        // escaping, so `_`/`%` in the argument would act as wildcards.
        const row = await db.product.findUnique({
          ...ATOMIC_READ,
          where: { sku: sku.trim().toUpperCase() },
          include: PRODUCT_INCLUDE,
        });
        return row ? toProduct(row) : null;
      },
      async create(product) {
        const row = await runAtomic(db, async (tx) => {
          await tx.product.create({
            data: {
              id: product.id,
              ...productColumns(product),
              attributesExtra: extraJson(product.attributes.extra),
            },
          });
          await tx.productSecondaryCategory.createMany({
            data: secondaryCategoryRows(product),
          });
          await tx.productCollection.createMany({
            data: collectionLinkRows(product),
          });
          await tx.productMedia.createMany({
            data: productMediaRows(product),
          });
          return tx.product.findUniqueOrThrow({
            where: { id: product.id },
            include: PRODUCT_INCLUDE,
          });
        });
        return toProduct(row);
      },
      async update(product) {
        const row = await runAtomic(db, async (tx) => {
          await orNotFound(
            tx.product.update({
              where: { id: product.id },
              data: {
                ...productColumns(product),
                attributesExtra: extraJson(product.attributes.extra),
              },
            }),
            "Product",
            product.id,
          );
          await tx.productSecondaryCategory.deleteMany({
            where: { productId: product.id },
          });
          await tx.productCollection.deleteMany({
            where: { productId: product.id },
          });
          await tx.productMedia.deleteMany({
            where: { productId: product.id },
          });
          await tx.productSecondaryCategory.createMany({
            data: secondaryCategoryRows(product),
          });
          await tx.productCollection.createMany({
            data: collectionLinkRows(product),
          });
          await tx.productMedia.createMany({
            data: productMediaRows(product),
          });
          return tx.product.findUniqueOrThrow({
            where: { id: product.id },
            include: PRODUCT_INCLUDE,
          });
        });
        return toProduct(row);
      },
      async countActive() {
        return db.product.count({ where: { status: "published" } });
      },
      async countByStatus() {
        const groups = await db.product.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        const counts: Record<CatalogStatus, number> = {
          draft: 0,
          published: 0,
          archived: 0,
        };
        for (const group of groups) counts[group.status] = group._count._all;
        return counts;
      },
    },

    /* ── catalog: categories & collections ────────────────────────── */

    categories: {
      async list() {
        const rows = await db.category.findMany();
        return publishedInOrder(rows.map(toCategory));
      },
      async query(query = {}) {
        const rows = await db.category.findMany();
        return queryCategories(rows.map(toCategory), query);
      },
      async getById(id) {
        const row = await db.category.findUnique({ where: { id } });
        return row ? toCategory(row) : null;
      },
      async getBySlug(slug) {
        const row = await db.category.findUnique({ where: { slug } });
        return row ? toCategory(row) : null;
      },
      async create(category) {
        return toCategory(
          await db.category.create({
            data: { id: category.id, ...categoryColumns(category) },
          }),
        );
      },
      async update(category) {
        return toCategory(
          await orNotFound(
            db.category.update({
              where: { id: category.id },
              data: categoryColumns(category),
            }),
            "Category",
            category.id,
          ),
        );
      },
      async count() {
        return db.category.count({ where: { status: { not: "archived" } } });
      },
    },

    collections: {
      async list() {
        const rows = await db.collection.findMany();
        return publishedInOrder(rows.map(toCollection));
      },
      async query(query = {}) {
        const rows = await db.collection.findMany();
        return queryCollections(rows.map(toCollection), query);
      },
      async getById(id) {
        const row = await db.collection.findUnique({ where: { id } });
        return row ? toCollection(row) : null;
      },
      async getBySlug(slug) {
        const row = await db.collection.findUnique({ where: { slug } });
        return row ? toCollection(row) : null;
      },
      async create(collection) {
        return toCollection(
          await db.collection.create({
            data: { id: collection.id, ...collectionColumns(collection) },
          }),
        );
      },
      async update(collection) {
        return toCollection(
          await orNotFound(
            db.collection.update({
              where: { id: collection.id },
              data: collectionColumns(collection),
            }),
            "Collection",
            collection.id,
          ),
        );
      },
      async count() {
        return db.collection.count({ where: { status: { not: "archived" } } });
      },
    },

    /* ── catalog: media ───────────────────────────────────────────── */

    media: {
      async getById(id) {
        const row = await db.mediaAsset.findUnique({ where: { id } });
        return row ? toMediaAsset(row) : null;
      },
      async listByIds(ids) {
        const rows = await db.mediaAsset.findMany({
          where: { id: { in: ids } },
        });
        return rows.map(toMediaAsset);
      },
      async create(asset) {
        return toMediaAsset(
          await db.mediaAsset.create({
            data: { id: asset.id, ...mediaAssetColumns(asset) },
          }),
        );
      },
      async delete(id) {
        // Idempotent like the JSON provider: deleting a missing asset is a
        // no-op. Deleting one still referenced by product media fails on the
        // FK — the application detaches first (see deleteProductMedia).
        await db.mediaAsset.deleteMany({ where: { id } });
      },
    },

    /* ── operations placeholders (no tables yet — Phase 6+) ───────── */

    orders: {
      async list(params) {
        const rows = await db.order.findMany({
          ...ATOMIC_READ,
          include: ORDER_INCLUDE,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return paginate(rows.map(toOrder), params);
      },
      async getById(id) {
        const row = await db.order.findUnique({
          ...ATOMIC_READ,
          where: { id },
          include: ORDER_INCLUDE,
        });
        return row ? toOrder(row) : null;
      },
      async getByOrderNumber(orderNumber) {
        const row = await db.order.findUnique({
          ...ATOMIC_READ,
          where: { orderNumber },
          include: ORDER_INCLUDE,
        });
        return row ? toOrder(row) : null;
      },
      async getByIdempotencyKey(userId, idempotencyKey) {
        const row = await db.order.findUnique({
          ...ATOMIC_READ,
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: ORDER_INCLUDE,
        });
        return row ? toOrder(row) : null;
      },
      async listByUserId(userId, params) {
        const rows = await db.order.findMany({
          ...ATOMIC_READ,
          where: { userId },
          include: ORDER_INCLUDE,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return paginate(rows.map(toOrder), params);
      },
      async query(params) {
        // Same deliberate trade-off as the catalog: load rows and run the
        // SHARED predicates (catalog-logic.queryOrders), so search/sort
        // semantics are byte-identical across providers and Prisma's
        // insensitive-ILIKE pitfalls never enter the picture. Status is
        // pushed down as a cheap SQL pre-filter; revisit with real volume.
        const rows = await db.order.findMany({
          ...ATOMIC_READ,
          ...(params.status ? { where: { status: params.status } } : {}),
          include: ORDER_INCLUDE,
        });
        return queryOrders(rows.map(toOrder), params);
      },
      async create(order) {
        // orderNumber and (userId, idempotencyKey) uniqueness are enforced
        // by the database constraints; a violation surfaces as P2002 and
        // callers resolve it by looking the existing order up.
        const row = await runAtomic(db, async (tx) => {
          await tx.order.create({
            data: { id: order.id, ...orderColumns(order) },
          });
          await tx.orderItem.createMany({ data: orderItemRows(order) });
          return tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: ORDER_INCLUDE,
          });
        });
        return toOrder(row);
      },
      async count() {
        return db.order.count();
      },
      async countByStatus() {
        const groups = await db.order.groupBy({
          by: ["status"],
          _count: { _all: true },
        });
        const counts: Record<string, number> = {};
        for (const group of groups) counts[group.status] = group._count._all;
        return counts;
      },
      async transitionStatus(orderId, expectedStatus, nextStatus, updatedAt) {
        const result = await db.order.updateMany({
          where: { id: orderId, status: expectedStatus },
          data: { status: nextStatus, updatedAt: new Date(updatedAt) },
        });
        if (result.count === 0) return null;
        const row = await db.order.findUniqueOrThrow({
          ...ATOMIC_READ,
          where: { id: orderId },
          include: ORDER_INCLUDE,
        });
        return toOrder(row);
      },
    },

    orderActivities: {
      async listByOrderId(orderId) {
        const rows = await db.orderActivity.findMany({
          where: { orderId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toOrderActivity);
      },
      async create(activity) {
        const row = await db.orderActivity.create({
          data: {
            id: activity.id,
            orderId: activity.orderId,
            type: activity.type,
            actorUserId: activity.actorUserId ?? null,
            fromStatus: activity.fromStatus ?? null,
            toStatus: activity.toStatus ?? null,
            metadata: activity.metadata ?? Prisma.DbNull,
            createdAt: new Date(activity.createdAt),
          },
        });
        return toOrderActivity(row);
      },
    },

    orderNotes: {
      async listByOrderId(orderId) {
        const rows = await db.orderNote.findMany({
          where: { orderId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toOrderNote);
      },
      async create(note) {
        const row = await db.orderNote.create({
          data: {
            id: note.id,
            orderId: note.orderId,
            authorUserId: note.authorUserId ?? null,
            authorName: note.authorName,
            body: note.body,
            createdAt: new Date(note.createdAt),
          },
        });
        return toOrderNote(row);
      },
    },

    appointments: {
      async list() {
        return [];
      },
      async count() {
        return 0;
      },
    },

    /* ── identity ─────────────────────────────────────────────────── */

    users: {
      async getById(id) {
        const row = await db.user.findUnique({ where: { id } });
        return row ? toUser(row) : null;
      },
      async findByEmail(email) {
        // Emails are stored lowercase (normalized by the signup/login
        // schemas), so lowercasing the argument gives the JSON provider's
        // case-insensitive behavior as an EXACT match on the unique index.
        // Deliberately not Prisma's `mode: "insensitive"`: that compiles to
        // unescaped ILIKE, so `_`/`%` — both legal in email addresses —
        // would act as wildcards and could resolve the WRONG account.
        const row = await db.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });
        return row ? toUser(row) : null;
      },
      async create(user) {
        return toUser(
          await db.user.create({ data: { id: user.id, ...userColumns(user) } }),
        );
      },
      async update(user) {
        return toUser(
          await orNotFound(
            db.user.update({ where: { id: user.id }, data: userColumns(user) }),
            "User",
            user.id,
          ),
        );
      },
    },

    credentials: {
      async getByUserId(userId) {
        const row = await db.authCredential.findUnique({ where: { userId } });
        return row ? toCredential(row) : null;
      },
      async create(credential) {
        return toCredential(
          await db.authCredential.create({
            data: { id: credential.id, ...credentialColumns(credential) },
          }),
        );
      },
      async update(credential) {
        // Monotonic sessionVersion, enforced in the WHERE clause so the
        // check and the write are one statement — the same guarantee the
        // JSON provider gets from its store lock, with identical errors.
        const result = await db.authCredential.updateMany({
          where: {
            id: credential.id,
            sessionVersion: { lte: credential.sessionVersion },
          },
          data: credentialColumns(credential),
        });
        if (result.count === 0) {
          const current = await db.authCredential.findUnique({
            where: { id: credential.id },
          });
          if (!current) {
            throw new Error(`Credential not found: ${credential.id}`);
          }
          throw new Error(
            `Credential ${credential.id}: sessionVersion cannot move backwards (${current.sessionVersion} -> ${credential.sessionVersion}).`,
          );
        }
        const row = await db.authCredential.findUniqueOrThrow({
          where: { id: credential.id },
        });
        return toCredential(row);
      },
    },

    /* ── customer data ────────────────────────────────────────────── */

    customers: {
      async getByUserId(userId) {
        const row = await db.customerProfile.findUnique({
          ...ATOMIC_READ,
          where: { userId },
          include: PROFILE_INCLUDE,
        });
        return row ? toCustomerProfile(row) : null;
      },
      async create(profile) {
        const row = await runAtomic(db, async (tx) => {
          await tx.customerProfile.create({
            data: { id: profile.id, ...profileColumns(profile) },
          });
          await tx.customerAddress.createMany({ data: addressRows(profile) });
          if (profile.defaultAddressId) {
            await tx.customerProfile.update({
              where: { id: profile.id },
              data: { defaultAddressId: profile.defaultAddressId },
            });
          }
          return tx.customerProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: PROFILE_INCLUDE,
          });
        });
        return toCustomerProfile(row);
      },
      async update(profile) {
        // Ordering matters: clear the default pointer, replace the address
        // rows, then point the default at the recreated row — every
        // intermediate state satisfies the FK without deferring it.
        const row = await runAtomic(db, async (tx) => {
          await orNotFound(
            tx.customerProfile.update({
              where: { id: profile.id },
              data: { ...profileColumns(profile), defaultAddressId: null },
            }),
            "Customer profile",
            profile.id,
          );
          await tx.customerAddress.deleteMany({
            where: { profileId: profile.id },
          });
          await tx.customerAddress.createMany({ data: addressRows(profile) });
          if (profile.defaultAddressId) {
            await tx.customerProfile.update({
              where: { id: profile.id },
              data: { defaultAddressId: profile.defaultAddressId },
            });
          }
          return tx.customerProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: PROFILE_INCLUDE,
          });
        });
        return toCustomerProfile(row);
      },
      async list(params) {
        const rows = await db.customerProfile.findMany({
          ...ATOMIC_READ,
          include: PROFILE_INCLUDE,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return paginate(rows.map(toCustomerProfile), params);
      },
      async count() {
        return db.customerProfile.count();
      },
    },

    measurementProfiles: {
      async listByUserId(userId) {
        const rows = await db.measurementProfile.findMany({
          ...ATOMIC_READ,
          where: { userId, archivedAt: null },
          include: MEASUREMENT_INCLUDE,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toMeasurementProfile);
      },
      async getById(id) {
        const row = await db.measurementProfile.findUnique({
          ...ATOMIC_READ,
          where: { id },
          include: MEASUREMENT_INCLUDE,
        });
        return row ? toMeasurementProfile(row) : null;
      },
      async create(profile) {
        const row = await runAtomic(db, async (tx) => {
          await tx.measurementProfile.create({
            data: { id: profile.id, ...measurementColumns(profile) },
          });
          await tx.measurementValue.createMany({
            data: measurementValueRows(profile),
          });
          return tx.measurementProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: MEASUREMENT_INCLUDE,
          });
        });
        return toMeasurementProfile(row);
      },
      async update(profile) {
        const row = await runAtomic(db, async (tx) => {
          await orNotFound(
            tx.measurementProfile.update({
              where: { id: profile.id },
              data: measurementColumns(profile),
            }),
            "Measurement profile",
            profile.id,
          );
          await tx.measurementValue.deleteMany({
            where: { profileId: profile.id },
          });
          await tx.measurementValue.createMany({
            data: measurementValueRows(profile),
          });
          return tx.measurementProfile.findUniqueOrThrow({
            where: { id: profile.id },
            include: MEASUREMENT_INCLUDE,
          });
        });
        return toMeasurementProfile(row);
      },
    },

    /* ── shopping ─────────────────────────────────────────────────── */

    carts: {
      async getByUserId(userId) {
        const row = await db.cart.findUnique({
          ...ATOMIC_READ,
          where: { userId },
          include: CART_INCLUDE,
        });
        return row ? toCart(row) : null;
      },
      async create(cart) {
        const row = await runAtomic(db, async (tx) => {
          await tx.cart.create({ data: { id: cart.id, ...cartColumns(cart) } });
          await tx.cartItem.createMany({ data: cartItemRows(cart) });
          return tx.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: CART_INCLUDE,
          });
        });
        return toCart(row);
      },
      async update(cart) {
        const row = await runAtomic(db, async (tx) => {
          await orNotFound(
            tx.cart.update({ where: { id: cart.id }, data: cartColumns(cart) }),
            "Cart",
            cart.id,
          );
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          await tx.cartItem.createMany({ data: cartItemRows(cart) });
          return tx.cart.findUniqueOrThrow({
            where: { id: cart.id },
            include: CART_INCLUDE,
          });
        });
        return toCart(row);
      },
    },

    wishlists: {
      async getByUserId(userId) {
        const row = await db.wishlist.findUnique({
          ...ATOMIC_READ,
          where: { userId },
          include: WISHLIST_INCLUDE,
        });
        return row ? toWishlist(row) : null;
      },
      async create(wishlist) {
        const row = await runAtomic(db, async (tx) => {
          await tx.wishlist.create({
            data: { id: wishlist.id, ...wishlistColumns(wishlist) },
          });
          await tx.wishlistItem.createMany({ data: wishlistItemRows(wishlist) });
          return tx.wishlist.findUniqueOrThrow({
            where: { id: wishlist.id },
            include: WISHLIST_INCLUDE,
          });
        });
        return toWishlist(row);
      },
      async update(wishlist) {
        const row = await runAtomic(db, async (tx) => {
          await orNotFound(
            tx.wishlist.update({
              where: { id: wishlist.id },
              data: wishlistColumns(wishlist),
            }),
            "Wishlist",
            wishlist.id,
          );
          await tx.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
          await tx.wishlistItem.createMany({ data: wishlistItemRows(wishlist) });
          return tx.wishlist.findUniqueOrThrow({
            where: { id: wishlist.id },
            include: WISHLIST_INCLUDE,
          });
        });
        return toWishlist(row);
      },
    },

    /* ── customization requests (Phase 7B foundation) ─────────────── */

    customizationRequests: {
      async getById(id) {
        const row = await db.customizationRequest.findUnique({ where: { id } });
        return row ? toCustomizationRequest(row) : null;
      },
      async listByUserId(userId) {
        const rows = await db.customizationRequest.findMany({
          where: { userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return rows.map(toCustomizationRequest);
      },
      async create(request) {
        return toCustomizationRequest(
          await db.customizationRequest.create({
            data: customizationRequestColumns(request),
          }),
        );
      },
      async update(request) {
        return toCustomizationRequest(
          await orNotFound(
            db.customizationRequest.update({
              where: { id: request.id },
              data: customizationRequestColumns(request),
            }),
            "Customization request",
            request.id,
          ),
        );
      },
    },

    /* ── password reset tokens ────────────────────────────────────── */

    passwordResetTokens: {
      async create(token) {
        return toResetToken(
          await db.passwordResetToken.create({
            data: { id: token.id, ...resetTokenColumns(token) },
          }),
        );
      },
      async findValidByHash(tokenHash) {
        const row = await db.passwordResetToken.findFirst({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        return row ? toResetToken(row) : null;
      },
      async markUsed(id) {
        // Idempotent-silent on a missing id, like the JSON provider.
        await db.passwordResetToken.updateMany({
          where: { id },
          data: { usedAt: new Date() },
        });
      },
    },
  };
}

/* ── public factory ─────────────────────────────────────────────── */

const globalCache = globalThis as unknown as {
  __lcsPostgresRepositories?: Repositories;
};

export function getPostgresRepositories(): Repositories {
  if (globalCache.__lcsPostgresRepositories) {
    return globalCache.__lcsPostgresRepositories;
  }

  const prisma = getPrismaClient();
  const base = buildPostgresRepositories(prisma);

  /**
   * `repos.transaction(fn)` — a REAL database transaction: BEGIN, the
   * callback's writes, COMMIT; any throw rolls the whole unit back. The
   * callback receives repositories bound to the transaction client, so
   * every repository call inside participates automatically. Nested
   * transactions are not offered, matching the documented contract.
   *
   * Isolation is PostgreSQL's default (READ COMMITTED). Together with the
   * in-process `withLock` serialization this preserves the exact Phase 5C
   * account-mutation guarantees; cross-process writers arrive only with
   * multi-instance deployment, which is out of scope until then (see
   * docs/phase-5d-database.md for the SELECT ... FOR UPDATE upgrade path).
   */
  async function transaction<T>(
    fn: (tx: StoreRepositories) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(
      async (tx) => fn(buildPostgresRepositories(tx)),
      // scrypt verification (~100ms) can run inside account mutations, and
      // a slow cloud round trip must not abort a correct commit.
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  globalCache.__lcsPostgresRepositories = { ...base, transaction };
  return globalCache.__lcsPostgresRepositories;
}
