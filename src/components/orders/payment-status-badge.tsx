import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS } from "@/server/payments/workflow";
import type { PaymentStatus } from "@/types/domain";

/**
 * The shared payment-status → badge mapping, mirroring OrderStatusBadge.
 * "unavailable" is the honest label for orders with no payment record at
 * all (pre-Phase-10 history, or a failed initiation) — never fabricated.
 */
const STATUS_BADGE: Record<
  PaymentStatus,
  { tone: "gold" | "success" | "danger" | "neutral" }
> = {
  unpaid: { tone: "gold" },
  pending: { tone: "gold" },
  authorized: { tone: "gold" },
  paid: { tone: "success" },
  failed: { tone: "danger" },
  cancelled: { tone: "neutral" },
  refunded: { tone: "neutral" },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus | null }) {
  if (!status) {
    return <Badge tone="neutral">Payment info unavailable</Badge>;
  }
  const { tone } = STATUS_BADGE[status] ?? { tone: "gold" as const };
  return <Badge tone={tone}>{PAYMENT_STATUS_LABELS[status] ?? status}</Badge>;
}
