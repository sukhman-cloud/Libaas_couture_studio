"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import {
  initialOrderActionState,
  recordManualPaymentAction,
} from "@/lib/orders/actions";
import type { PaymentStatus } from "@/types/domain";

/**
 * Admin-only manual/offline payment recording (Phase 10 foundation). Shown
 * only when the payment isn't already paid/refunded — the action itself
 * re-validates server-side regardless of what this component renders.
 */
export function PaymentOperations({
  orderNumber,
  status,
}: {
  orderNumber: string;
  status: PaymentStatus | null;
}) {
  const [state, action, pending] = useActionState(
    recordManualPaymentAction,
    initialOrderActionState,
  );

  if (status === "paid" || status === "refunded" || status === "cancelled") {
    return null;
  }

  return (
    <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-navy-800">
        Record payment
      </h2>
      <p className="mt-1 text-sm text-muted">
        Mark this order as paid after confirming cash or offline payment with
        the customer. The amount always matches the order total.
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <button type="submit" disabled={pending} className={buttonStyles({ size: "sm" })}>
          {pending ? "Saving..." : "Mark as paid"}
        </button>
      </form>
      <div role="status" aria-live="polite">
        {state.message && <p className="mt-3 text-sm text-success">{state.message}</p>}
        {!state.ok && <p className="mt-3 text-sm text-danger">{state.error}</p>}
      </div>
    </section>
  );
}
