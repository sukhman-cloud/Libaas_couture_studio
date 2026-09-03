import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/types/domain";

/**
 * The shared status → badge mapping used by customer and admin order views.
 */
const STATUS_BADGE: Record<OrderStatus, { label: string; tone: "gold" | "success" | "danger" }> = {
  pending: { label: "Pending", tone: "gold" },
  confirmed: { label: "Confirmed", tone: "success" },
  processing: { label: "Processing", tone: "gold" },
  ready: { label: "Ready", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = STATUS_BADGE[status] ?? {
    label: status,
    tone: "gold" as const,
  };
  return <Badge tone={tone}>{label}</Badge>;
}
