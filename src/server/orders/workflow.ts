import type { OrderStatus } from "@/types/domain";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "ready",
  "completed",
  "cancelled",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready", "cancelled"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
};

export function allowedNextStatuses(status: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[status]];
}

export function isAllowedStatusTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return TRANSITIONS[current].includes(next);
}
