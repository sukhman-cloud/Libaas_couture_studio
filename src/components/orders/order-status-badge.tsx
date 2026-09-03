import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/domain";

/**
 * The one status → badge mapping (Phase 7C). The vocabulary deliberately
 * holds a single value today; new statuses arrive together with the
 * business workflow that sets them — extend this map then, never before.
 */
const STATUS_BADGE: Record<OrderStatus, { label: string; tone: "gold" }> = {
  pending: { label: "Pending", tone: "gold" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = STATUS_BADGE[status] ?? {
    label: status,
    tone: "gold" as const,
  };
  return <Badge tone={tone}>{label}</Badge>;
}
