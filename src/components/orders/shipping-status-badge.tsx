import { Badge } from "@/components/ui/badge";
import { SHIPMENT_STATUS_LABELS } from "@/server/shipping/workflow";
import type { ShipmentStatus } from "@/types/domain";

/**
 * The shared shipment-status → badge mapping, mirroring PaymentStatusBadge.
 * "unavailable" is the honest label for orders with no shipment record at
 * all (pre-Phase-11 history, or fulfillment hasn't started) — never
 * fabricated.
 */
const STATUS_BADGE: Record<
  ShipmentStatus,
  { tone: "gold" | "success" | "danger" | "neutral" }
> = {
  not_ready: { tone: "neutral" },
  preparing: { tone: "gold" },
  ready_to_ship: { tone: "gold" },
  shipped: { tone: "gold" },
  out_for_delivery: { tone: "gold" },
  delivered: { tone: "success" },
  delivery_failed: { tone: "danger" },
  returned: { tone: "danger" },
  cancelled: { tone: "neutral" },
};

export function ShippingStatusBadge({ status }: { status: ShipmentStatus | null }) {
  if (!status) {
    return <Badge tone="neutral">Shipping info unavailable</Badge>;
  }
  const { tone } = STATUS_BADGE[status] ?? { tone: "gold" as const };
  return <Badge tone={tone}>{SHIPMENT_STATUS_LABELS[status] ?? status}</Badge>;
}
