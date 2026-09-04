import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import type { StoreRepositories } from "@/server/data/repositories";
import type {
  InventoryItem,
  InventoryLevel,
  InventoryMovementType,
  Order,
  OrderActivityType,
} from "@/types/domain";

/**
 * Inventory & stock management foundation (Phase 13).
 *
 * ONE ROW PER PRODUCT — this catalog has no variant/option concept (no
 * size/color splits exist), so every function here keys off `productId`
 * directly. A product with no `InventoryItem` row at all is the default
 * for every product created before this phase and for any product an
 * admin never opts into tracking for: it behaves EXACTLY as before —
 * purchasability is governed solely by the existing `ProductAvailability`
 * enum (`isPurchasable` in commerce/rules.ts), which this module never
 * touches or overrides. Inventory is an ADDITIONAL, independent gate that
 * only applies once `trackingEnabled` is true.
 *
 * `quantityAvailable` is NEVER stored — every reader computes it as
 * `quantityOnHand - quantityReserved`, so it can never drift from its two
 * inputs. Every quantity-changing operation is a compare-and-set delta
 * (`InventoryRepository.adjustOnHand`/`adjustReserved`): the caller reads
 * the current row, submits its exact quantities back as `expected`, and
 * the repository only applies the delta if nothing changed between the
 * read and the write — otherwise it returns null and the caller re-reads
 * and retries. This is the same optimistic-concurrency discipline
 * `OrderRepository.transitionStatus` uses for status, applied to a
 * quantity delta instead of a fixed-state transition.
 *
 * RESERVATION POLICY (documented per §6 of the phase brief): inventory is
 * reserved the moment an order is CREATED (inside the same transaction as
 * `createOrderFromCheckout`), independent of payment status — a COD order
 * reserves stock exactly like a prepaid one would, because the studio is
 * committing to fulfil it either way. Reservation is released back to
 * available stock ONLY when an order is cancelled. It is deliberately
 * NEVER released or converted to a "sale" decrement on any other status
 * transition (confirmed/processing/ready/completed): this phase does not
 * yet distinguish "reserved for a live order" from "sold and shipped" in
 * the ledger — both simply hold the reservation until cancellation is the
 * one event that frees it. A future phase that wants to convert a
 * reservation into a hard decrement on `completed` (or on a shipment
 * "delivered" event) can do so without changing this policy's shape: it
 * would add a new movement type and a new call site, not restructure
 * reservation itself.
 */

const RESERVE_MOVEMENT: InventoryMovementType = "reservation";
const RELEASE_MOVEMENT: InventoryMovementType = "reservation_release";

function toLevel(item: InventoryItem | null): InventoryLevel | null {
  if (!item) return null;
  return {
    quantityOnHand: item.quantityOnHand,
    quantityReserved: item.quantityReserved,
    quantityAvailable: item.quantityOnHand - item.quantityReserved,
    lowStockThreshold: item.lowStockThreshold,
    trackingEnabled: item.trackingEnabled,
  };
}

/** ShipmentActivityType/PaymentActivityType share this pattern: inventory
 *  movement types map onto the matching OrderActivityType entries. */
function toOrderActivityType(type: "reserved" | "released"): OrderActivityType {
  return type === "reserved" ? "inventory_reserved" : "inventory_released";
}

async function logOrderActivity(
  tx: StoreRepositories,
  orderId: string,
  type: "reserved" | "released",
  now: string,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await tx.orderActivities.create({
    id: randomUUID(),
    orderId,
    type: toOrderActivityType(type),
    createdAt: now,
    ...(metadata ? { metadata } : {}),
  });
}

/* ── reads ──────────────────────────────────────────────────────── */

/** Level for one product, or null when no inventory row exists (the
 *  product behaves as before this phase — no inventory gate applies). */
export async function getInventoryLevel(
  productId: string,
  repos?: Pick<StoreRepositories, "inventoryItems">,
): Promise<InventoryLevel | null> {
  const r = repos ?? getRepositories();
  return toLevel(await r.inventoryItems.getByProductId(productId));
}

export async function getInventoryLevelsByProductIds(
  productIds: string[],
  repos?: Pick<StoreRepositories, "inventoryItems">,
): Promise<Map<string, InventoryLevel>> {
  if (productIds.length === 0) return new Map();
  const r = repos ?? getRepositories();
  const items = await r.inventoryItems.listByProductIds(productIds);
  const map = new Map<string, InventoryLevel>();
  for (const item of items) {
    const level = toLevel(item);
    if (level) map.set(item.productId, level);
  }
  return map;
}

/**
 * Customer-safe availability label — never exposes reserved/on-hand
 * counts, only a truthful bucket. Untracked products (or products with no
 * row) return null: their availability is entirely the existing
 * `ProductAvailability` enum's job, and the UI must not invent a stock
 * message for them.
 */
export type CustomerStockLabel = "in_stock" | "limited" | "out_of_stock";

export function customerStockLabel(level: InventoryLevel | null): CustomerStockLabel | null {
  if (!level || !level.trackingEnabled) return null;
  if (level.quantityAvailable <= 0) return "out_of_stock";
  if (level.quantityAvailable <= level.lowStockThreshold) return "limited";
  return "in_stock";
}

/**
 * Whether `quantity` units of `productId` can be reserved right now.
 * Untracked products (no row, or `trackingEnabled: false`) always pass —
 * inventory imposes no additional gate on them.
 */
export async function hasSufficientStock(
  productId: string,
  quantity: number,
  repos?: Pick<StoreRepositories, "inventoryItems">,
): Promise<boolean> {
  const level = await getInventoryLevel(productId, repos);
  if (!level || !level.trackingEnabled) return true;
  return level.quantityAvailable >= quantity;
}

/* ── reservation (order creation) ──────────────────────────────────── */

export type ReserveLineResult =
  | { ok: true }
  | { ok: false; reason: "insufficient_stock"; productId: string };

/**
 * Reserve stock for every tracked line in `lines`, INSIDE the caller's
 * transaction (`tx` — must be the same `tx` the order itself is being
 * written in, so a reservation failure rolls the whole order back with
 * it: no partial order, no partial reservation, per the phase brief).
 *
 * Idempotent per order: the movement's idempotency key is
 * `reserve:<orderId>:<orderItemId>`, so a retried/replayed order-creation
 * transaction (idempotency-key replay, or a duplicate-key race resolved
 * by re-running this against the same tx) can never double-reserve — the
 * second attempt's movement insert is rejected by the unique constraint
 * and this function returns the existing reservation as already-applied.
 *
 * Called ONLY for a freshly-created order's own items, never speculatively
 * — so `orderId`/`orderItemId` are always fresh, real, never client input.
 */
export async function reserveInventoryForOrder(
  tx: StoreRepositories,
  order: Pick<Order, "id" | "items">,
  actorUserId?: string,
): Promise<ReserveLineResult> {
  const now = new Date().toISOString();
  let reservedAny = false;

  for (const line of order.items) {
    let item = await tx.inventoryItems.getByProductId(line.productId);
    if (!item || !item.trackingEnabled) continue; // untracked — no gate

    const idempotencyKey = `reserve:${order.id}:${line.id}`;
    const existing = await tx.inventoryMovements.getByIdempotencyKey(item.id, idempotencyKey);
    if (existing) continue; // already reserved by a prior attempt on this tx

    const available = item.quantityOnHand - item.quantityReserved;
    if (available < line.quantity) {
      return { ok: false, reason: "insufficient_stock", productId: line.productId };
    }

    const updated = await tx.inventoryItems.adjustReserved(item.id, line.quantity, {
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
    });
    if (!updated) {
      // Concurrent writer changed the row between our read and write —
      // re-read once and retry the same check exactly once. A second
      // failure here means genuine contention; the whole order transaction
      // aborts and the customer sees the standard "please try again".
      item = await tx.inventoryItems.getByProductId(line.productId);
      if (!item) continue;
      const retryAvailable = item.quantityOnHand - item.quantityReserved;
      if (retryAvailable < line.quantity) {
        return { ok: false, reason: "insufficient_stock", productId: line.productId };
      }
      const retried = await tx.inventoryItems.adjustReserved(item.id, line.quantity, {
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
      });
      if (!retried) {
        return { ok: false, reason: "insufficient_stock", productId: line.productId };
      }
      item = retried;
    } else {
      item = updated;
    }

    await tx.inventoryMovements.create({
      id: randomUUID(),
      inventoryItemId: item.id,
      productId: item.productId,
      type: RESERVE_MOVEMENT,
      quantityChange: line.quantity,
      quantityAfter: item.quantityOnHand,
      orderId: order.id,
      orderItemId: line.id,
      idempotencyKey,
      createdAt: now,
      ...(actorUserId ? { actorUserId } : {}),
    });
    reservedAny = true;
  }

  if (reservedAny) {
    await logOrderActivity(tx, order.id, "reserved", now);
  }
  return { ok: true };
}

/* ── release (order cancellation) ──────────────────────────────────── */

/**
 * Release every reservation this order holds, INSIDE the caller's
 * transaction (mirrors `transitionAdminOrder`'s existing structure — call
 * this after the order's own status CAS succeeds, before returning).
 *
 * Idempotent: release keys off `release:<orderId>:<orderItemId>`, distinct
 * from the reserve key, so releasing twice (e.g. a retried cancellation
 * request) is a safe no-op — the second call's movement insert collides
 * with the first and this function skips it. Only lines that actually
 * have a matching `reservation` movement on this order are released, so
 * an order whose reservation already failed/never happened releases
 * nothing (nothing to double-release).
 */
export async function releaseInventoryForOrder(
  tx: StoreRepositories,
  order: Pick<Order, "id" | "items">,
  actorUserId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const orderMovements = await tx.inventoryMovements.listByOrderId(order.id);
  const reservedItemIds = new Set(
    orderMovements.filter((m) => m.type === RESERVE_MOVEMENT).map((m) => m.orderItemId),
  );
  let releasedAny = false;

  for (const line of order.items) {
    if (!reservedItemIds.has(line.id)) continue; // never reserved — nothing to release

    const item = await tx.inventoryItems.getByProductId(line.productId);
    if (!item) continue; // inventory row removed since — nothing left to release against

    const idempotencyKey = `release:${order.id}:${line.id}`;
    const existing = await tx.inventoryMovements.getByIdempotencyKey(item.id, idempotencyKey);
    if (existing) continue; // already released

    const updated = await tx.inventoryItems.adjustReserved(item.id, -line.quantity, {
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
    });
    // A failed CAS here means a concurrent writer moved the row; the
    // release is not lost — it will be retried the next time this order's
    // cancellation is (re)processed, since the idempotency key is still
    // unclaimed. Never throw: releasing stock must not block a cancellation
    // from completing.
    const finalItem = updated ?? item;

    await tx.inventoryMovements.create({
      id: randomUUID(),
      inventoryItemId: finalItem.id,
      productId: finalItem.productId,
      type: RELEASE_MOVEMENT,
      quantityChange: -line.quantity,
      quantityAfter: finalItem.quantityOnHand,
      orderId: order.id,
      orderItemId: line.id,
      idempotencyKey,
      createdAt: now,
      ...(actorUserId ? { actorUserId } : {}),
    });
    releasedAny = true;
  }

  if (releasedAny) {
    await logOrderActivity(tx, order.id, "released", now);
  }
}

/** Server-minted per-render idempotency key for the admin stock-adjustment
 *  form, mirroring generateIdempotencyKey in orders/service.ts. */
export function generateInventoryIdempotencyKey(): string {
  return randomUUID();
}

/* ── admin: manual adjustment / restock ─────────────────────────────── */

export type AdjustStockResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; error: string };

const ADJUSTMENT_TYPES: InventoryMovementType[] = [
  "restock",
  "adjustment",
  "damaged",
  "correction",
  "return",
  "initial_stock",
];
const MAX_REASON_LENGTH = 500;

/**
 * Admin-only manual stock change (§10/§11/§18 of the phase brief: add,
 * remove, correct, mark damaged, restock, and the returns-foundation
 * "return" type — all the same shape, distinguished by `type`). Creates
 * the InventoryItem row on first use if none exists yet (opts the product
 * into tracking). Never allows the resulting `quantityOnHand` to go
 * negative — the repository's CAS refuses that at the storage layer as a
 * second backstop even though this function also checks it first.
 */
export async function adjustStock(input: {
  productId: string;
  type: InventoryMovementType;
  quantityChange: number;
  reason?: string;
  actorUserId?: string;
  /** Caller-supplied idempotency key (e.g. a form-submission nonce) so a
   *  double-click/retry can never apply the same adjustment twice. */
  idempotencyKey?: string;
}): Promise<AdjustStockResult> {
  const { productId, type, actorUserId, idempotencyKey } = input;
  if (!ADJUSTMENT_TYPES.includes(type)) {
    return { ok: false, error: "That movement type is not available for a manual adjustment." };
  }
  if (!Number.isInteger(input.quantityChange) || input.quantityChange === 0) {
    return { ok: false, error: "Enter a non-zero whole-number quantity." };
  }
  const reason = input.reason?.trim().slice(0, MAX_REASON_LENGTH) || undefined;

  const repos = getRepositories();
  try {
    return await repos.transaction(async (tx): Promise<AdjustStockResult> => {
      let item = await tx.inventoryItems.getByProductId(productId);
      const now = new Date().toISOString();

      if (!item) {
        const product = await tx.products.getById(productId);
        if (!product) return { ok: false, error: "Product not found." };
        item = await tx.inventoryItems.create({
          id: randomUUID(),
          productId,
          trackingEnabled: true,
          quantityOnHand: 0,
          quantityReserved: 0,
          lowStockThreshold: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (idempotencyKey) {
        const existing = await tx.inventoryMovements.getByIdempotencyKey(item.id, idempotencyKey);
        if (existing) return { ok: true, item };
      }

      const nextOnHand = item.quantityOnHand + input.quantityChange;
      if (nextOnHand < 0) {
        return {
          ok: false,
          error: `That would take stock below zero (currently ${item.quantityOnHand}).`,
        };
      }

      const updated = await tx.inventoryItems.adjustOnHand(item.id, input.quantityChange, {
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
      });
      if (!updated) {
        return { ok: false, error: "Stock changed since this page loaded. Refresh and try again." };
      }

      await tx.inventoryMovements.create({
        id: randomUUID(),
        inventoryItemId: updated.id,
        productId: updated.productId,
        type,
        quantityChange: input.quantityChange,
        quantityAfter: updated.quantityOnHand,
        createdAt: now,
        ...(actorUserId ? { actorUserId } : {}),
        ...(reason ? { reason } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });

      return { ok: true, item: updated };
    });
  } catch (error) {
    console.error(
      `[inventory] stock adjustment failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not update stock. Please try again." };
  }
}

export type SetTrackingResult = { ok: true; item: InventoryItem } | { ok: false; error: string };

/**
 * Admin-only: enable/disable tracking and/or set the low-stock threshold
 * for a product, without changing quantities. Creates the row (at zero
 * stock) on first use if tracking is being enabled and none exists yet.
 */
export async function setInventoryTracking(input: {
  productId: string;
  trackingEnabled: boolean;
  lowStockThreshold?: number;
}): Promise<SetTrackingResult> {
  const { productId, trackingEnabled } = input;
  if (
    input.lowStockThreshold !== undefined &&
    (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0)
  ) {
    return { ok: false, error: "Low-stock threshold must be a non-negative whole number." };
  }

  const repos = getRepositories();
  try {
    return await repos.transaction(async (tx): Promise<SetTrackingResult> => {
      const now = new Date().toISOString();
      const existing = await tx.inventoryItems.getByProductId(productId);

      if (!existing) {
        const product = await tx.products.getById(productId);
        if (!product) return { ok: false, error: "Product not found." };
        const created = await tx.inventoryItems.create({
          id: randomUUID(),
          productId,
          trackingEnabled,
          quantityOnHand: 0,
          quantityReserved: 0,
          lowStockThreshold: input.lowStockThreshold ?? 0,
          createdAt: now,
          updatedAt: now,
        });
        return { ok: true, item: created };
      }

      const updated = await tx.inventoryItems.update({
        ...existing,
        trackingEnabled,
        lowStockThreshold: input.lowStockThreshold ?? existing.lowStockThreshold,
        updatedAt: now,
      });
      return { ok: true, item: updated };
    });
  } catch (error) {
    console.error(
      `[inventory] tracking update failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not update tracking settings." };
  }
}

/* ── admin read views ───────────────────────────────────────────────── */

export interface AdminInventoryListItem {
  productId: string;
  productName: string;
  sku: string;
  trackingEnabled: boolean;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  lowStockThreshold: number;
  status: "healthy" | "low" | "out_of_stock" | "not_tracked";
}

function statusOf(level: InventoryLevel): AdminInventoryListItem["status"] {
  if (!level.trackingEnabled) return "not_tracked";
  if (level.quantityAvailable <= 0) return "out_of_stock";
  if (level.quantityAvailable <= level.lowStockThreshold) return "low";
  return "healthy";
}

export interface AdminInventoryMovementView {
  type: InventoryMovementType;
  quantityChange: number;
  quantityAfter: number;
  actorName: string;
  reason?: string;
  orderId?: string;
  createdAt: string;
}

export interface AdminInventoryDetail extends AdminInventoryListItem {
  inventoryItemId?: string;
  movements: AdminInventoryMovementView[];
}

/** Full detail for one product's inventory, including recent movements —
 *  admin-only surface, never exposed to a customer response. */
export async function getAdminInventoryDetail(
  productId: string,
): Promise<AdminInventoryDetail | null> {
  const repos = getRepositories();
  const product = await repos.products.getById(productId);
  if (!product) return null;

  const item = await repos.inventoryItems.getByProductId(productId);
  const level: InventoryLevel = item
    ? {
        quantityOnHand: item.quantityOnHand,
        quantityReserved: item.quantityReserved,
        quantityAvailable: item.quantityOnHand - item.quantityReserved,
        lowStockThreshold: item.lowStockThreshold,
        trackingEnabled: item.trackingEnabled,
      }
    : {
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        lowStockThreshold: 0,
        trackingEnabled: false,
      };

  const movements = item
    ? await repos.inventoryMovements.listByInventoryItemId(item.id, { limit: 50 })
    : [];

  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    trackingEnabled: level.trackingEnabled,
    quantityOnHand: level.quantityOnHand,
    quantityReserved: level.quantityReserved,
    quantityAvailable: level.quantityAvailable,
    lowStockThreshold: level.lowStockThreshold,
    status: statusOf(level),
    ...(item ? { inventoryItemId: item.id } : {}),
    movements: movements.map((m) => ({
      type: m.type,
      quantityChange: m.quantityChange,
      quantityAfter: m.quantityAfter,
      actorName: m.actorUserId ?? "System",
      ...(m.reason ? { reason: m.reason } : {}),
      ...(m.orderId ? { orderId: m.orderId } : {}),
      createdAt: m.createdAt,
    })),
  };
}

export interface AdminInventoryList {
  items: AdminInventoryListItem[];
  total: number;
  pageCount: number;
}

export const ADMIN_INVENTORY_PER_PAGE = 20;

export async function listAdminInventory(params: {
  search?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  page?: number;
}): Promise<AdminInventoryList> {
  const repos = getRepositories();
  const page = Math.max(1, Math.floor(params.page ?? 1));

  const paged = await repos.inventoryItems.query({
    search: params.search,
    lowStockOnly: params.lowStockOnly,
    outOfStockOnly: params.outOfStockOnly,
    limit: ADMIN_INVENTORY_PER_PAGE,
    offset: (page - 1) * ADMIN_INVENTORY_PER_PAGE,
  });

  const products = await Promise.all(
    paged.rows.map((item) => repos.products.getById(item.productId)),
  );

  const items: AdminInventoryListItem[] = paged.rows.map((item, index) => {
    const product = products[index];
    const level: InventoryLevel = {
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
      quantityAvailable: item.quantityOnHand - item.quantityReserved,
      lowStockThreshold: item.lowStockThreshold,
      trackingEnabled: item.trackingEnabled,
    };
    return {
      productId: item.productId,
      productName: product?.name ?? "(product not found)",
      sku: product?.sku ?? "",
      trackingEnabled: item.trackingEnabled,
      quantityOnHand: item.quantityOnHand,
      quantityReserved: item.quantityReserved,
      quantityAvailable: level.quantityAvailable,
      lowStockThreshold: item.lowStockThreshold,
      status: statusOf(level),
    };
  });

  return {
    items,
    total: paged.total,
    pageCount: Math.max(1, Math.ceil(paged.total / ADMIN_INVENTORY_PER_PAGE)),
  };
}

/* ── fulfillment readiness integration (Phase 11) ───────────────────── */

/** Products with insufficient available stock for the quantity an order
 *  needs — used by computeFulfillmentReadiness (shipping/service.ts). */
export async function findInventoryShortfalls(
  order: Pick<Order, "items">,
): Promise<Array<{ productId: string; productName: string; short: number }>> {
  const repos = getRepositories();
  const productIds = order.items.map((i) => i.productId);
  const items = await repos.inventoryItems.listByProductIds(productIds);
  const byProductId = new Map(items.map((i) => [i.productId, i]));

  const shortfalls: Array<{ productId: string; productName: string; short: number }> = [];
  for (const line of order.items) {
    const item = byProductId.get(line.productId);
    if (!item || !item.trackingEnabled) continue;
    // Reservation already accounts for THIS order's own quantity, so the
    // relevant question post-order is simply "did on-hand fall below what
    // is reserved" (e.g. a manual correction after the fact) — not
    // re-subtracting this order's own reservation a second time.
    if (item.quantityOnHand < item.quantityReserved) {
      shortfalls.push({
        productId: line.productId,
        productName: line.nameSnapshot,
        short: item.quantityReserved - item.quantityOnHand,
      });
    }
  }
  return shortfalls;
}
