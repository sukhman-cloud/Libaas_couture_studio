import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import type { StoreRepositories } from "@/server/data/repositories";
import { isAllowedShipmentTransition } from "@/server/shipping/workflow";
import type {
  Order,
  OrderActivityType,
  OrderAddressSnapshot,
  Shipment,
  ShipmentActivityType,
  ShipmentMethod,
  ShipmentStatus,
} from "@/types/domain";

/**
 * Shipping & fulfillment foundation (Phase 11) — the order → shipment seam.
 *
 * NO REAL CARRIER EXISTS YET. Everything here is admin-entered text
 * (carrier name, tracking reference) or a server-validated status
 * transition — nothing calls out to a live shipping API, computes a real
 * rate, or generates a real label. `createShipment`/`transitionShipment`/
 * `updateShipmentTracking` follow the exact discipline the Phase 10
 * payment service established: re-read fresh rows inside a transaction,
 * validate against the state machine, and log activity for every write.
 *
 * ADDRESS RULE — a shipment NEVER stores its own copy of the delivery
 * address. `Order.shippingAddress` is already an immutable, purchase-time
 * snapshot (Phase 6C); every shipment reader re-derives the address from
 * the order it belongs to, so a later address-book edit or deletion can
 * never retroactively change what a shipment says it delivered to.
 */

const MAX_CARRIER_LENGTH = 80;
const MAX_TRACKING_LENGTH = 100;
const MAX_ESTIMATED_DELIVERY_LENGTH = 80;

function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * A tri-state patch: "absent" (key not submitted — leave the field alone),
 * "clear" (submitted empty — remove the field), or a normalized value.
 * Distinguishing these matters: the admin tracking form always submits all
 * three fields, including empty ones, so a naive undefined-means-skip
 * treatment would make an emptied field impossible to actually clear.
 */
type TextPatch = { present: false } | { present: true; value: string | undefined };

function textPatch(value: unknown, maxLength: number): TextPatch {
  if (value === undefined) return { present: false };
  if (typeof value !== "string") return { present: false };
  return { present: true, value: normalizeText(value, maxLength) };
}

/** ShipmentActivityType/OrderActivityType share every name except two:
 *  "webhook_processed" -> "shipment_webhook_processed" and
 *  "tracking_updated" -> "shipment_tracking_updated". */
function toOrderActivityType(type: ShipmentActivityType): OrderActivityType {
  if (type === "webhook_processed") return "shipment_webhook_processed";
  if (type === "tracking_updated") return "shipment_tracking_updated";
  return type;
}

async function logActivity(
  tx: StoreRepositories,
  shipment: Shipment,
  type: ShipmentActivityType,
  now: string,
  extra?: {
    actorUserId?: string;
    fromStatus?: ShipmentStatus;
    toStatus?: ShipmentStatus;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  await tx.shipmentActivities.create({
    id: randomUUID(),
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    type,
    createdAt: now,
    ...(extra?.actorUserId ? { actorUserId: extra.actorUserId } : {}),
    ...(extra?.fromStatus ? { fromStatus: extra.fromStatus } : {}),
    ...(extra?.toStatus ? { toStatus: extra.toStatus } : {}),
    ...(extra?.metadata ? { metadata: extra.metadata } : {}),
  });
  await tx.orderActivities.create({
    id: randomUUID(),
    orderId: shipment.orderId,
    type: toOrderActivityType(type),
    createdAt: now,
    ...(extra?.actorUserId ? { actorUserId: extra.actorUserId } : {}),
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Shipment already exists") || /unique constraint/i.test(message)
  );
}

const VALID_METHODS: ShipmentMethod[] = ["standard", "local_delivery", "pickup", "provider_managed"];

export type CreateShipmentResult =
  | { outcome: "created" | "replayed"; shipment: Shipment }
  | {
      outcome: "rejected";
      reason: "order_not_found" | "invalid_method";
      message: string;
    }
  | { outcome: "failed"; message: string };

class ShipmentRejection extends Error {
  constructor(public readonly result: CreateShipmentResult) {
    super("shipment rejected");
  }
}

/**
 * Admin-only shipment creation for an order. Idempotent: calling it again
 * for an order that already has a shipment returns the existing record
 * rather than erroring (covers double-click / retry). The order id is the
 * only identity input; the delivery address is never accepted from a
 * caller — it is read from the order at display time, never copied here.
 */
export async function createShipment(input: {
  orderId: string;
  method: ShipmentMethod;
  actorUserId?: string;
}): Promise<CreateShipmentResult> {
  const { orderId, actorUserId } = input;
  if (!VALID_METHODS.includes(input.method)) {
    return {
      outcome: "rejected",
      reason: "invalid_method",
      message: "That shipping method is not available.",
    };
  }
  const method = input.method;
  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<CreateShipmentResult> => {
      const order = await tx.orders.getById(orderId);
      if (!order) {
        throw new ShipmentRejection({
          outcome: "rejected",
          reason: "order_not_found",
          message: "Order not found.",
        });
      }

      const existing = await tx.shipments.getByOrderId(order.id);
      if (existing) {
        return { outcome: "replayed", shipment: existing };
      }

      const now = new Date().toISOString();
      const shipment: Shipment = {
        id: randomUUID(),
        orderId: order.id,
        status: "not_ready",
        method,
        createdAt: now,
        updatedAt: now,
      };

      const created = await tx.shipments.create(shipment);
      await logActivity(tx, created, "shipment_created", now, {
        ...(actorUserId ? { actorUserId } : {}),
        metadata: { method },
      });

      return { outcome: "created", shipment: created };
    });
  } catch (error) {
    if (error instanceof ShipmentRejection) return error.result;
    if (isDuplicateKeyError(error)) {
      try {
        const winner = await repos.shipments.getByOrderId(orderId);
        if (winner) return { outcome: "replayed", shipment: winner };
      } catch {
        /* fall through */
      }
    }
    console.error(
      `[shipping] shipment creation failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return {
      outcome: "failed",
      message: "Something went wrong while creating the shipment. Please try again.",
    };
  }
}

export type ShipmentMutationResult =
  | { ok: true; shipment: Shipment }
  | { ok: false; error: string };

const ACTIVITY_FOR_STATUS: Partial<Record<ShipmentStatus, ShipmentActivityType>> = {
  preparing: "shipment_preparing",
  ready_to_ship: "shipment_ready_to_ship",
  shipped: "shipment_dispatched",
  out_for_delivery: "shipment_out_for_delivery",
  delivered: "shipment_delivered",
  delivery_failed: "shipment_delivery_failed",
  returned: "shipment_returned",
  cancelled: "shipment_cancelled",
};

/**
 * Admin-only, server-validated status transition. Re-reads the shipment
 * inside a transaction, validates against the state machine (never trusts
 * a client-submitted status blindly), applies the optimistic-concurrency
 * `transitionStatus` (compare-and-set on the expected current status —
 * protects against two admins racing the same shipment), stamps the
 * shipped/delivered/cancelled timestamp when the target status implies
 * one, and logs activity.
 */
export async function transitionShipment(input: {
  orderId: string;
  nextStatus: ShipmentStatus;
  actorUserId?: string;
}): Promise<ShipmentMutationResult> {
  const { orderId, nextStatus, actorUserId } = input;
  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<ShipmentMutationResult> => {
      const shipment = await tx.shipments.getByOrderId(orderId);
      if (!shipment) return { ok: false, error: "No shipment exists for this order." };
      if (!isAllowedShipmentTransition(shipment.status, nextStatus)) {
        return {
          ok: false,
          error: `Cannot move a shipment from "${shipment.status}" to "${nextStatus}".`,
        };
      }

      const now = new Date().toISOString();
      const transitioned = await tx.shipments.transitionStatus(
        shipment.id,
        shipment.status,
        nextStatus,
        now,
      );
      if (!transitioned) {
        return { ok: false, error: "This shipment changed. Refresh and try again." };
      }

      const timestampPatch: Partial<Shipment> =
        nextStatus === "shipped"
          ? { shippedAt: now }
          : nextStatus === "delivered"
            ? { deliveredAt: now }
            : nextStatus === "cancelled"
              ? { cancelledAt: now }
              : {};
      const finalized =
        Object.keys(timestampPatch).length > 0
          ? await tx.shipments.update({ ...transitioned, ...timestampPatch })
          : transitioned;

      const activityType = ACTIVITY_FOR_STATUS[nextStatus] ?? "tracking_updated";
      await logActivity(tx, finalized, activityType, now, {
        ...(actorUserId ? { actorUserId } : {}),
        fromStatus: shipment.status,
        toStatus: nextStatus,
      });

      return { ok: true, shipment: finalized };
    });
  } catch (error) {
    console.error(
      `[shipping] transition failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not update the shipment." };
  }
}

/**
 * Admin-only tracking update — validated, trimmed, length-capped. Safe to
 * call repeatedly (idempotent: re-submitting the same carrier/tracking
 * number is a no-op write that still logs one "tracking_updated" activity
 * per call, which is the intended audit behavior — an admin correcting a
 * typo should be visible in history).
 */
export async function updateShipmentTracking(input: {
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  actorUserId?: string;
}): Promise<ShipmentMutationResult> {
  const { orderId, actorUserId } = input;
  const carrier = textPatch(input.carrier, MAX_CARRIER_LENGTH);
  const trackingNumber = textPatch(input.trackingNumber, MAX_TRACKING_LENGTH);
  const estimatedDelivery = textPatch(input.estimatedDelivery, MAX_ESTIMATED_DELIVERY_LENGTH);

  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<ShipmentMutationResult> => {
      const shipment = await tx.shipments.getByOrderId(orderId);
      if (!shipment) return { ok: false, error: "No shipment exists for this order." };

      const now = new Date().toISOString();
      const patch: Partial<Shipment> = {};
      if (carrier.present) patch.carrier = carrier.value;
      if (trackingNumber.present) patch.trackingNumber = trackingNumber.value;
      if (estimatedDelivery.present) patch.estimatedDelivery = estimatedDelivery.value;

      const updated = await tx.shipments.update({
        ...shipment,
        ...patch,
        updatedAt: now,
      });

      await logActivity(tx, updated, "tracking_updated", now, {
        ...(actorUserId ? { actorUserId } : {}),
        metadata: {
          ...(carrier.present && carrier.value ? { carrier: carrier.value } : {}),
          ...(trackingNumber.present && trackingNumber.value
            ? { trackingNumber: trackingNumber.value }
            : {}),
        },
      });

      return { ok: true, shipment: updated };
    });
  } catch (error) {
    console.error(
      `[shipping] tracking update failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not update tracking information." };
  }
}

/* ── fulfillment readiness ──────────────────────────────────────── */

export interface FulfillmentReadiness {
  ready: boolean;
  hasStitchedItems: boolean;
  hasCustomization: boolean;
  blockingReasons: string[];
}

/**
 * Server-side readiness signal for the admin: whether an order LOOKS ready
 * to prepare for shipment, given order/payment/customization state. This
 * NEVER mutates anything — it is read-only guidance, not a gate that
 * blocks the admin from acting, and no order status changes as a side
 * effect of computing it. Business rules here are intentionally narrow so
 * a future phase can extend them without removing this function's shape.
 */
export function computeFulfillmentReadiness(input: {
  order: Order;
  paymentStatus: string | null;
  customizationStatuses: string[];
}): FulfillmentReadiness {
  const { order, paymentStatus, customizationStatuses } = input;
  const hasStitchedItems = order.items.some((item) => item.stitching?.selected === true);
  const hasCustomization = order.items.some((item) => item.customizationRequestId !== undefined);

  const blockingReasons: string[] = [];
  if (order.status === "cancelled") {
    blockingReasons.push("The order is cancelled.");
  }
  if (paymentStatus === "failed") {
    blockingReasons.push("Payment failed — resolve payment before shipping.");
  }
  const unresolvedCustomizations = customizationStatuses.filter(
    (status) => status !== "completed" && status !== "rejected" && status !== "cancelled",
  );
  if (unresolvedCustomizations.length > 0) {
    blockingReasons.push(
      `${unresolvedCustomizations.length} customization request${unresolvedCustomizations.length === 1 ? "" : "s"} on this order ${unresolvedCustomizations.length === 1 ? "is" : "are"} still open.`,
    );
  }

  return {
    ready: blockingReasons.length === 0,
    hasStitchedItems,
    hasCustomization,
    blockingReasons,
  };
}

/* ── read models ────────────────────────────────────────────────── */

export interface ShipmentView {
  status: ShipmentStatus;
  method: ShipmentMethod;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  shippedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

function toShipmentView(shipment: Shipment): ShipmentView {
  return {
    status: shipment.status,
    method: shipment.method,
    ...(shipment.carrier ? { carrier: shipment.carrier } : {}),
    ...(shipment.trackingNumber ? { trackingNumber: shipment.trackingNumber } : {}),
    ...(shipment.estimatedDelivery ? { estimatedDelivery: shipment.estimatedDelivery } : {}),
    ...(shipment.shippedAt ? { shippedAt: shipment.shippedAt } : {}),
    ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt } : {}),
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

/** Ownership-checked shipment lookup for a customer's own order. Never
 *  includes the delivery address — the caller already has it from the
 *  order's own snapshot. */
export async function getOwnShipmentForOrder(
  userId: string,
  order: Order,
): Promise<ShipmentView | null> {
  if (order.userId !== userId) return null;
  const shipment = await getRepositories().shipments.getByOrderId(order.id);
  return shipment ? toShipmentView(shipment) : null;
}

export interface AdminShipmentActivityView {
  type: ShipmentActivityType;
  fromStatus?: ShipmentStatus;
  toStatus?: ShipmentStatus;
  actorName: string;
  createdAt: string;
}

export interface AdminShipmentView extends ShipmentView {
  shippingAddress: OrderAddressSnapshot;
  activities: AdminShipmentActivityView[];
}

/** Full shipment detail for the admin order page, including the order's
 *  own immutable address snapshot (never a separate copy). */
export async function getAdminShipmentForOrder(order: Order): Promise<AdminShipmentView | null> {
  const repos = getRepositories();
  const shipment = await repos.shipments.getByOrderId(order.id);
  if (!shipment) return null;

  const activities = await repos.shipmentActivities.listByShipmentId(shipment.id);

  return {
    ...toShipmentView(shipment),
    shippingAddress: order.shippingAddress,
    activities: activities.map((activity) => ({
      type: activity.type,
      ...(activity.fromStatus ? { fromStatus: activity.fromStatus } : {}),
      ...(activity.toStatus ? { toStatus: activity.toStatus } : {}),
      actorName: activity.actorUserId ?? "System",
      createdAt: activity.createdAt,
    })),
  };
}
