import "server-only";
import { createHash, randomBytes, randomUUID } from "crypto";
import {
  buildMeasurementSnapshot,
  checkCartLineConfiguration,
  itemHasConfiguration,
} from "@/server/cart/configuration";
import { validateCheckoutAddress } from "@/server/checkout/service";
import {
  effectivePriceOf,
  isPurchasable,
  MAX_QUANTITY_PER_ITEM,
} from "@/server/commerce/service";
import { getRepositories } from "@/server/data";
import { customerLockKey, withLock } from "@/server/lock";
import { getOwnPaymentForOrder, type PaymentView } from "@/server/payments/service";
import { getOwnShipmentForOrder, type ShipmentView } from "@/server/shipping/service";
import type {
  Money,
  Order,
  OrderAddressSnapshot,
  OrderItem,
  OrderItemMeasurementSnapshot,
  User,
} from "@/types/domain";

/**
 * Order creation (Phase 6C) — the cart → order transaction.
 *
 * `createOrderFromCheckout` is the ONLY way an order comes into being.
 * It follows the same discipline as the Phase 5C account seam: take the
 * customer's domain lock, open ONE `repos.transaction`, RE-READ every
 * fact inside it, validate everything against those fresh rows, and
 * commit all writes (order + items + cart clearing) as one unit. A throw
 * anywhere rolls the whole unit back: no partial order, cart untouched.
 *
 * TRUST BOUNDARY — the browser contributes exactly two values: the
 * selected address id and the idempotency key (itself server-minted at
 * checkout render). Prices, totals, quantities, product identity,
 * availability and ownership are all re-derived inside the transaction;
 * form fields claiming any of those are never read.
 *
 * IDEMPOTENCY — the key is a per-render UUID; `(userId, key)` is unique
 * in storage. Same user + same key + same submitted address ⇒ the
 * ORIGINAL order is returned (covers double-click, network retry, and
 * §36 recovery when a committed order's response was lost). Same key
 * with a different address ⇒ safe rejection. Two racing submissions with
 * the same key are serialized by the customer lock in-process, and the
 * unique constraint is the cross-process backstop: the loser looks the
 * winner's order up and returns it.
 *
 * PRICE RULE — the cart line's snapshot must equal the product's CURRENT
 * effective price at commit time, or creation stops with a price-change
 * result. Nothing is ever silently re-priced in either direction.
 */

/* ── result model (client-safe: no internals, no raw errors) ─────── */

/** What the success surface may show — nothing internal. */
export interface PlacedOrderView {
  orderNumber: string;
  total: Money;
  subtotal: Money;
  itemCount: number;
  totalQuantity: number;
  placedAt: string;
  items: Array<{
    name: string;
    slug: string;
    quantity: number;
    unitPrice: Money;
    lineSubtotal: Money;
    hasConfiguration: boolean;
    /** The line was ordered with studio stitching (Phase 7A). */
    stitched: boolean;
    /** Label snapshot of the measurement profile at order time. */
    measurementProfileLabel?: string;
    /**
     * The order carries the immutable measurement snapshot (Phase 7B).
     * False for stitched orders placed BEFORE 7B — readers must say the
     * snapshot is unavailable, never substitute current profile values.
     */
    hasMeasurementSnapshot: boolean;
  }>;
  shippingAddress: OrderAddressSnapshot;
  customerName: string;
}

export type CreateOrderResult =
  | { outcome: "created" | "replayed"; order: PlacedOrderView }
  | {
      outcome: "rejected";
      reason:
        | "invalid_request"
        | "account_inactive"
        | "idempotency_conflict"
        | "cart_empty"
        | "item_unavailable"
        | "price_changed"
        | "invalid_quantity"
        | "configuration_invalid"
        | "address_invalid"
        | "currency_mismatch";
      message: string;
    }
  | { outcome: "failed"; message: string };

/* ── order number ───────────────────────────────────────────────── */

/**
 * Customer-facing order number: LCS-XXXX-XXXX from an unambiguous
 * alphabet (no 0/O/1/I), crypto-random. 32⁸ ≈ 1.1 × 10¹² combinations —
 * unguessable, non-sequential (reveals no order volume), collision-safe
 * at boutique scale, and backed by a unique constraint regardless.
 */
const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateOrderNumber(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ORDER_NUMBER_ALPHABET[bytes[i] % ORDER_NUMBER_ALPHABET.length];
    if (i === 3) code += "-";
  }
  return `LCS-${code}`;
}

/** Server-minted per-render confirmation key (checkout page render). */
export function generateIdempotencyKey(): string {
  return randomUUID();
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fingerprint of the client-supplied confirmation inputs (the address
 *  selection is the only one) — replay detection, never printed. */
function fingerprintRequest(addressId: string): string {
  return createHash("sha256").update(`v1:${addressId}`).digest("hex");
}

/* ── helpers ────────────────────────────────────────────────────── */

const zero = (currency: Order["currency"]): Money => ({
  amount: 0,
  currency,
});

function toPlacedView(order: Order): PlacedOrderView {
  return {
    orderNumber: order.orderNumber,
    total: order.total,
    subtotal: order.subtotal,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    placedAt: order.createdAt,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      slug: item.slugSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineSubtotal: item.lineSubtotal,
      hasConfiguration: itemHasConfiguration(item),
      stitched: item.stitching?.selected === true,
      ...(item.stitching?.measurementProfileLabel
        ? { measurementProfileLabel: item.stitching.measurementProfileLabel }
        : {}),
      hasMeasurementSnapshot: item.stitching?.measurements !== undefined,
    })),
    shippingAddress: order.shippingAddress,
    customerName: order.customer.name,
  };
}

/** A rejected result — messages here are customer-safe by construction. */
function reject(
  reason: Extract<CreateOrderResult, { outcome: "rejected" }>["reason"],
  message: string,
): CreateOrderResult {
  return { outcome: "rejected", reason, message };
}

class OrderRejection extends Error {
  constructor(public readonly result: CreateOrderResult) {
    super("order rejected");
  }
}

/** Storage uniqueness violation for (userId, idempotencyKey) — Prisma
 *  P2002 or the JSON provider's guarded-create error. */
function isDuplicateKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Duplicate idempotency key") ||
    /unique constraint/i.test(message)
  );
}

/* ── the transaction ────────────────────────────────────────────── */

export async function createOrderFromCheckout(input: {
  user: User;
  addressId: string;
  idempotencyKey: string;
}): Promise<CreateOrderResult> {
  const { user } = input;
  const addressId = typeof input.addressId === "string" ? input.addressId : "";
  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";

  if (!addressId) {
    return reject("invalid_request", "Choose a delivery address to continue.");
  }
  if (!UUID_PATTERN.test(idempotencyKey)) {
    // Keys are server-minted UUIDs; anything else is a tampered form.
    return reject(
      "invalid_request",
      "This checkout session is no longer valid. Reload the page and try again.",
    );
  }

  const fingerprint = fingerprintRequest(addressId);
  const repos = getRepositories();

  const run = () =>
    repos.transaction(async (tx): Promise<CreateOrderResult> => {
      /* 1. idempotency: has this confirmation already created an order? */
      const existing = await tx.orders.getByIdempotencyKey(
        user.id,
        idempotencyKey,
      );
      if (existing) {
        if (existing.requestFingerprint === fingerprint) {
          return { outcome: "replayed", order: toPlacedView(existing) };
        }
        return reject(
          "idempotency_conflict",
          "This confirmation was already used with different details. Reload the page to start again.",
        );
      }

      /* 2. re-read the customer — the account must still be active. */
      const freshUser = await tx.users.getById(user.id);
      if (!freshUser || freshUser.kind !== "customer" || !freshUser.isActive) {
        throw new OrderRejection(
          reject("account_inactive", "Your session has ended. Please sign in again."),
        );
      }

      /* 3. address: ownership + validity, re-checked inside the tx. */
      const address = await validateCheckoutAddress(user.id, addressId, tx);
      if (!address.ok) {
        throw new OrderRejection(
          reject(
            "address_invalid",
            "That address is not available. Choose one of your saved addresses.",
          ),
        );
      }

      /* 4. cart: re-read and validate every line against fresh products. */
      const cart = await tx.carts.getByUserId(user.id);
      if (!cart || cart.items.length === 0) {
        throw new OrderRejection(
          reject("cart_empty", "Your cart is empty — nothing to order."),
        );
      }

      const currency: Order["currency"] = "INR";
      const orderItems: OrderItem[] = [];
      let subtotalPaise = 0;

      for (const line of cart.items) {
        if (
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > MAX_QUANTITY_PER_ITEM
        ) {
          throw new OrderRejection(
            reject(
              "invalid_quantity",
              "A quantity in your bag is invalid. Review your bag and try again.",
            ),
          );
        }

        const product = await tx.products.getById(line.productId);
        if (!product || product.status !== "published" || !isPurchasable(product)) {
          throw new OrderRejection(
            reject(
              "item_unavailable",
              "A piece in your bag is no longer available. Review your bag and try again.",
            ),
          );
        }

        /* Stitching configuration (Phase 7A) — the SAME check the cart
           and checkout run, re-run against transaction-scoped rows: the
           profile must still exist, belong to this customer and be
           unarchived, and the product must still offer stitching. */
        const configCheck = await checkCartLineConfiguration({
          userId: user.id,
          item: line,
          product,
          repos: tx,
        });
        if (!configCheck.ok) {
          throw new OrderRejection(
            reject(
              "configuration_invalid",
              "A stitching configuration in your bag needs attention. Review your bag and try again.",
            ),
          );
        }
        /* Fresh snapshot object (never the cart line's reference): the
           profile LABEL (7A) and the full MEASUREMENTS (7B) are copied
           at order time from the transaction-read profile, so the
           historical order keeps representing exactly what was ordered
           no matter how the profile is edited, re-united, re-labelled
           or archived afterwards. The browser contributed nothing here.
           A profile that fails snapshot validation stops the WHOLE
           order — no partial snapshot is ever written. */
        let stitchingSnapshot;
        if (configCheck.stitched && configCheck.profile) {
          const measured = buildMeasurementSnapshot(configCheck.profile);
          if (!measured.ok) {
            console.error(
              `[orders] measurement snapshot refused for profile ${configCheck.profile.id}: ${measured.problem}`,
            );
            throw new OrderRejection(
              reject(
                "configuration_invalid",
                "A measurement profile in your bag needs attention. Review it and try again.",
              ),
            );
          }
          stitchingSnapshot = {
            selected: true,
            measurementProfileId: configCheck.profile.id,
            measurementProfileLabel: configCheck.profile.label,
            measurements: measured.snapshot,
          };
        }

        const current = effectivePriceOf(product);
        if (
          line.unitPrice.currency !== currency ||
          current.currency !== currency
        ) {
          throw new OrderRejection(
            reject(
              "currency_mismatch",
              "A price in your bag could not be verified. Review your bag and try again.",
            ),
          );
        }
        if (
          !Number.isSafeInteger(line.unitPrice.amount) ||
          line.unitPrice.amount < 0 ||
          current.amount !== line.unitPrice.amount
        ) {
          // The price the customer acknowledged is no longer the price.
          // Never silently charge either amount.
          throw new OrderRejection(
            reject(
              "price_changed",
              "The price of an item changed while you were checking out. Review your bag to continue.",
            ),
          );
        }

        const linePaise = line.unitPrice.amount * line.quantity;
        subtotalPaise += linePaise;

        orderItems.push({
          id: randomUUID(),
          productId: product.id,
          nameSnapshot: product.name,
          slugSnapshot: product.slug,
          quantity: line.quantity,
          unitPrice: { amount: line.unitPrice.amount, currency },
          lineSubtotal: { amount: linePaise, currency },
          configurationKey: line.configurationKey,
          ...(stitchingSnapshot === undefined
            ? {}
            : { stitching: stitchingSnapshot }),
          ...(line.customizationRequestId === undefined
            ? {}
            : { customizationRequestId: line.customizationRequestId }),
          ...(line.notes === undefined ? {} : { notes: line.notes }),
        });
      }

      if (!Number.isSafeInteger(subtotalPaise)) {
        throw new OrderRejection(
          reject("price_changed", "Your bag total could not be verified."),
        );
      }

      /* 5. totals — shipping/tax/discount are explicit zeros until those
            systems exist, so the formula holds from day one. */
      const shippingAmount = zero(currency);
      const taxAmount = zero(currency);
      const discountAmount = zero(currency);
      const totalPaise =
        subtotalPaise + shippingAmount.amount + taxAmount.amount - discountAmount.amount;

      /* 6. order number — collision-checked in-tx; the unique constraint
            is the backstop. */
      let orderNumber = generateOrderNumber();
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!(await tx.orders.getByOrderNumber(orderNumber))) break;
        orderNumber = generateOrderNumber();
      }

      const now = new Date().toISOString();
      const { fullName, phone, line1, line2, locality, city, state, postalCode, country } =
        address.address;
      const order: Order = {
        id: randomUUID(),
        orderNumber,
        userId: freshUser.id,
        status: "pending",
        customer: {
          name: freshUser.name,
          ...(freshUser.email === undefined ? {} : { email: freshUser.email }),
          ...(freshUser.phone === undefined ? {} : { phone: freshUser.phone }),
        },
        shippingAddress: {
          fullName,
          phone,
          line1,
          ...(line2 === undefined ? {} : { line2 }),
          ...(locality === undefined ? {} : { locality }),
          city,
          state,
          postalCode,
          country,
        },
        items: orderItems,
        currency,
        subtotal: { amount: subtotalPaise, currency },
        shippingAmount,
        taxAmount,
        discountAmount,
        total: { amount: totalPaise, currency },
        idempotencyKey,
        requestFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
      };

      /* 7. write order + items, then clear the cart — same unit. */
      const created = await tx.orders.create(order);
      await tx.orderActivities.create({
        id: randomUUID(),
        orderId: order.id,
        type: "order_created",
        createdAt: now,
      });
      await tx.carts.update({ ...cart, items: [], updatedAt: now });

      return { outcome: "created", order: toPlacedView(created) };
    });

  try {
    // The customer lock serializes this against every other mutation for
    // the same account (other confirmations, cart edits, deactivation).
    return await withLock(customerLockKey(user.id), run);
  } catch (error) {
    if (error instanceof OrderRejection) return error.result;

    if (isDuplicateKeyError(error)) {
      // Cross-process race on the same key: the other request won. Return
      // its order if the inputs match — the customer gets ONE order.
      try {
        const winner = await repos.orders.getByIdempotencyKey(
          user.id,
          idempotencyKey,
        );
        if (winner && winner.requestFingerprint === fingerprint) {
          return { outcome: "replayed", order: toPlacedView(winner) };
        }
      } catch {
        /* fall through to the generic failure */
      }
    }

    // Customer-safe by construction: no database errors, no internals.
    console.error(
      `[orders] order creation failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return {
      outcome: "failed",
      message:
        "Something went wrong while placing your order. Your bag is unchanged — please try again.",
    };
  }
}

/** Customer-facing order-number format — validated BEFORE any lookup, so
 *  malformed input never reaches storage and never becomes an oracle. */
export function isOrderNumber(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^LCS-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(value)
  );
}

/**
 * Ownership-aware lookup for the success page: the order is returned only
 * to the user it belongs to. Missing and foreign orders are
 * indistinguishable to the caller.
 */
export async function getOwnOrderByNumber(
  userId: string,
  orderNumber: string,
): Promise<PlacedOrderView | null> {
  if (!isOrderNumber(orderNumber)) return null;
  const order = await getRepositories().orders.getByOrderNumber(orderNumber);
  if (!order || order.userId !== userId) return null;
  return toPlacedView(order);
}

/* ── customer order history (Phase 7C — read + display only) ────── */

/**
 * View models for the customer's own order pages. Internal ids,
 * idempotency keys and fingerprints never leave the server; items are
 * rendered from the ORDER'S OWN snapshots (name, price, address,
 * measurements) — never re-resolved against current catalog or profile
 * data. Product media is deliberately not resolved from the current
 * catalog: OrderItem has no historical image reference, so old orders use
 * the honest placeholder rather than silently changing with catalog edits.
 */
export interface CustomerOrderItemView {
  id: string;
  name: string;
  slug: string;
  quantity: number;
  unitPrice: Money;
  lineSubtotal: Money;
  image?: { mediaId: string; alt: string };
  stitched: boolean;
  measurementProfileLabel?: string;
  /** The immutable Phase 7B snapshot, verbatim. Absent on pre-7B orders. */
  measurements?: OrderItemMeasurementSnapshot;
  hasMeasurementSnapshot: boolean;
  /** Cart-line notes, when the customer left any. */
  notes?: string;
  /** A customization request reference rides on the item (future flows). */
  hasCustomizationRequest: boolean;
  customization?: { status: string; details: string };
}

export interface CustomerOrderDetail {
  orderNumber: string;
  placedAt: string;
  status: Order["status"];
  customer: Order["customer"];
  shippingAddress: OrderAddressSnapshot;
  items: CustomerOrderItemView[];
  currency: Order["currency"];
  subtotal: Money;
  shippingAmount: Money;
  taxAmount: Money;
  discountAmount: Money;
  total: Money;
  itemCount: number;
  totalQuantity: number;
  /** Null when the order has no payment record yet — never fabricated. */
  payment: PaymentView | null;
  /** Null when the order has no shipment record yet — never fabricated. */
  shipment: ShipmentView | null;
  customizationRequests: Array<{
    id: string;
    status: string;
    details: string;
    orderItemId?: string;
  }>;
}

export interface CustomerOrderListItem {
  orderNumber: string;
  placedAt: string;
  status: Order["status"];
  itemCount: number;
  totalQuantity: number;
  total: Money;
  /** First line's snapshot name — "and N more" is the UI's job. */
  firstItemName: string;
  hasStitchedItems: boolean;
  image?: { mediaId: string; alt: string };
}

export interface CustomerOrderList {
  items: CustomerOrderListItem[];
  page: number;
  totalPages: number;
  totalOrders: number;
}

export const ORDERS_PER_PAGE = 10;

/** Item views for one order, shared with the admin service. */
export async function buildOrderItemViews(
  order: Order,
  userId?: string,
): Promise<CustomerOrderItemView[]> {
  return Promise.all(
    order.items.map(async (item) => {
      const request = userId && item.customizationRequestId
        ? await getRepositories().customizationRequests.getById(item.customizationRequestId)
        : null;
      return toCustomerItemView(
        item,
        undefined,
        request?.userId === userId && request
          ? { status: request.status, details: request.details }
          : undefined,
      );
    }),
  );
}

function toCustomerItemView(
  item: OrderItem,
  image?: { mediaId: string; alt: string },
  customization?: { status: string; details: string },
): CustomerOrderItemView {
  return {
    id: item.id,
    name: item.nameSnapshot,
    slug: item.slugSnapshot,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineSubtotal: item.lineSubtotal,
    ...(image ? { image } : {}),
    stitched: item.stitching?.selected === true,
    ...(item.stitching?.measurementProfileLabel
      ? { measurementProfileLabel: item.stitching.measurementProfileLabel }
      : {}),
    ...(item.stitching?.measurements
      ? { measurements: item.stitching.measurements }
      : {}),
    hasMeasurementSnapshot: item.stitching?.measurements !== undefined,
    ...(item.notes ? { notes: item.notes } : {}),
    hasCustomizationRequest: item.customizationRequestId !== undefined,
    ...(customization ? { customization } : {}),
  };
}

/**
 * The customer's own orders, newest first, one page at a time. Invalid
 * page values normalize; an out-of-range page clamps to the last one.
 * Pagination note (§13): the customer's own orders are read via the
 * ownership-scoped repository listing and paged here — at boutique scale
 * a per-customer count stays tiny, and the page contract is already in
 * place for when it is not.
 */
export async function listOwnOrders(
  userId: string,
  requestedPage?: unknown,
): Promise<CustomerOrderList> {
  const orders = await getRepositories().orders.listByUserId(userId);
  const totalOrders = orders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PER_PAGE));
  const parsed = Number(requestedPage);
  const page =
    Number.isInteger(parsed) && parsed >= 1
      ? Math.min(parsed, totalPages)
      : 1;

  const slice = orders.slice(
    (page - 1) * ORDERS_PER_PAGE,
    page * ORDERS_PER_PAGE,
  );
  const items = await Promise.all(
    slice.map(async (order): Promise<CustomerOrderListItem> => {
      const first = order.items[0];
      return {
        orderNumber: order.orderNumber,
        placedAt: order.createdAt,
        status: order.status,
        itemCount: order.items.length,
        totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
        total: order.total,
        firstItemName: first?.nameSnapshot ?? "",
        hasStitchedItems: order.items.some(
          (i) => i.stitching?.selected === true,
        ),
      };
    }),
  );
  return { items, page, totalPages, totalOrders };
}

/**
 * Full ownership-scoped order detail — the first real consumer of the
 * Phase 7B measurement snapshot. Malformed, unknown and foreign order
 * numbers are indistinguishable (null).
 */
export async function getOwnOrderDetail(
  userId: string,
  orderNumber: string,
): Promise<CustomerOrderDetail | null> {
  if (!isOrderNumber(orderNumber)) return null;
  const order = await getRepositories().orders.getByOrderNumber(orderNumber);
  if (!order || order.userId !== userId) return null;
  const requests = (await getRepositories().customizationRequests.list()).filter(
    (request) => request.userId === userId && request.orderId === order.id,
  );

  return {
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    status: order.status,
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    items: await buildOrderItemViews(order, userId),
    currency: order.currency,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    total: order.total,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
    payment: await getOwnPaymentForOrder(userId, order),
    shipment: await getOwnShipmentForOrder(userId, order),
    customizationRequests: requests.map((request) => ({
      id: request.id,
      status: request.status,
      details: request.details,
      ...(request.orderItemId ? { orderItemId: request.orderItemId } : {}),
    })),
  };
}
