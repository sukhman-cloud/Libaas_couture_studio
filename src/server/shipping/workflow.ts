import type { ShipmentStatus } from "@/types/domain";

export const SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "not_ready",
  "preparing",
  "ready_to_ship",
  "shipped",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "returned",
  "cancelled",
];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  not_ready: "Not ready",
  preparing: "Preparing",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  returned: "Returned",
  cancelled: "Cancelled",
};

/**
 * Fulfillment lifecycle (Phase 11 foundation). `not_ready` is the resting
 * state for a shipment record created before the studio has begun
 * preparing the order; `preparing`/`ready_to_ship` can still be cancelled;
 * once `shipped`, a delivery can fail or be returned, and a failed
 * delivery can be retried (`out_for_delivery`) or ultimately returned.
 * Terminal states (`delivered`, `returned`, `cancelled`) allow no further
 * transitions.
 */
const TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  not_ready: ["preparing", "ready_to_ship", "cancelled"],
  preparing: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "delivery_failed", "returned"],
  out_for_delivery: ["delivered", "delivery_failed", "returned"],
  delivery_failed: ["out_for_delivery", "returned"],
  delivered: [],
  returned: [],
  cancelled: [],
};

export function allowedNextShipmentStatuses(status: ShipmentStatus): ShipmentStatus[] {
  return [...TRANSITIONS[status]];
}

export function isAllowedShipmentTransition(
  current: ShipmentStatus,
  next: ShipmentStatus,
): boolean {
  return TRANSITIONS[current].includes(next);
}
