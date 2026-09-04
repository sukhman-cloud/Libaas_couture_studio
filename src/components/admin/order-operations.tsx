"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addOrderNoteAction,
  changeOrderStatusAction,
  initialOrderActionState,
} from "@/lib/orders/actions";
import { ORDER_STATUS_LABELS } from "@/server/orders/workflow";
import type { OrderStatus } from "@/types/domain";

export function OrderOperations({
  orderNumber,
  nextStatuses,
}: {
  orderNumber: string;
  nextStatuses: OrderStatus[];
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    changeOrderStatusAction,
    initialOrderActionState,
  );
  const [noteState, noteAction, notePending] = useActionState(
    addOrderNoteAction,
    initialOrderActionState,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Update status</h2>
        {nextStatuses.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextStatuses.map((nextStatus) => (
              <form
                key={nextStatus}
                action={statusAction}
                onSubmit={(event) => {
                  if (nextStatus === "cancelled" && !window.confirm("Cancel this order?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="orderNumber" value={orderNumber} />
                <input type="hidden" name="nextStatus" value={nextStatus} />
                <button
                  type="submit"
                  disabled={statusPending}
                  className={buttonStyles({
                    size: "sm",
                    variant: nextStatus === "cancelled" ? "outline" : "primary",
                  })}
                >
                  {statusPending ? "Saving..." : `Mark ${ORDER_STATUS_LABELS[nextStatus]}`}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No further status changes are available.</p>
        )}
        <div role="status" aria-live="polite">
          {statusState.message && <p className="mt-3 text-sm text-success">{statusState.message}</p>}
          {!statusState.ok && <p className="mt-3 text-sm text-danger">{statusState.error}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Internal note</h2>
        <form action={noteAction} className="mt-3 space-y-3">
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <Textarea
            name="body"
            required
            maxLength={2000}
            rows={4}
            placeholder="Add a private studio note"
            aria-label="Internal order note"
          />
          <button type="submit" disabled={notePending} className={buttonStyles({ size: "sm" })}>
            {notePending ? "Saving..." : "Add note"}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {noteState.message && <p className="mt-3 text-sm text-success">{noteState.message}</p>}
          {!noteState.ok && <p className="mt-3 text-sm text-danger">{noteState.error}</p>}
        </div>
      </section>
    </div>
  );
}
