import type { PaymentStatus } from "@/types/domain";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "unpaid",
  "pending",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "refunded",
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/**
 * Payment lifecycle (Phase 10 foundation). `unpaid` is the resting state
 * for offline/manual methods before the studio records payment; `pending`
 * is where an online-gateway attempt sits until a real provider confirms
 * or fails it (no gateway exists yet, so nothing advances past `pending`
 * on its own). Terminal states (`paid`, `cancelled`, `refunded`) allow no
 * further transitions except the one refund path.
 */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["pending", "authorized", "paid", "cancelled"],
  pending: ["authorized", "paid", "failed", "cancelled"],
  authorized: ["paid", "failed", "cancelled"],
  paid: ["refunded"],
  failed: ["pending", "cancelled"],
  cancelled: [],
  refunded: [],
};

export function allowedNextPaymentStatuses(status: PaymentStatus): PaymentStatus[] {
  return [...TRANSITIONS[status]];
}

export function isAllowedPaymentTransition(
  current: PaymentStatus,
  next: PaymentStatus,
): boolean {
  return TRANSITIONS[current].includes(next);
}
