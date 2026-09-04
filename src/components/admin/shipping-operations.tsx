"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InputControl } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createShipmentAction,
  initialOrderActionState,
  updateShipmentTrackingAction,
  transitionShipmentAction,
} from "@/lib/orders/actions";
import { SHIPMENT_STATUS_LABELS } from "@/server/shipping/workflow";
import type { ShipmentMethod, ShipmentStatus } from "@/types/domain";

const METHOD_LABELS: Record<ShipmentMethod, string> = {
  standard: "Standard delivery",
  local_delivery: "Local delivery",
  pickup: "Studio pickup",
  provider_managed: "Provider-managed (future)",
};

/** Confirmation is required before a terminal/destructive transition. */
const CONFIRM_STATUSES = new Set<ShipmentStatus>(["cancelled", "returned", "delivery_failed"]);

export function ShippingOperations({
  orderNumber,
  hasShipment,
  nextStatuses,
  carrier,
  trackingNumber,
  estimatedDelivery,
}: {
  orderNumber: string;
  hasShipment: boolean;
  nextStatuses: ShipmentStatus[];
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}) {
  const [createState, createAction, createPending] = useActionState(
    createShipmentAction,
    initialOrderActionState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    transitionShipmentAction,
    initialOrderActionState,
  );
  const [trackingState, trackingAction, trackingPending] = useActionState(
    updateShipmentTrackingAction,
    initialOrderActionState,
  );

  if (!hasShipment) {
    return (
      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Create shipment</h2>
        <p className="mt-1 text-sm text-muted">
          Start a fulfillment record for this order.
        </p>
        <form action={createAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <FormField label="Method" fieldId="shipment-method">
            <Select id="shipment-method" name="method" defaultValue="standard">
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <button type="submit" disabled={createPending} className={buttonStyles({ size: "sm" })}>
            {createPending ? "Creating..." : "Create shipment"}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {createState.message && (
            <p className="mt-3 text-sm text-success">{createState.message}</p>
          )}
          {!createState.ok && <p className="mt-3 text-sm text-danger">{createState.error}</p>}
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Update fulfillment</h2>
        {nextStatuses.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextStatuses.map((nextStatus) => (
              <form
                key={nextStatus}
                action={statusAction}
                onSubmit={(event) => {
                  if (
                    CONFIRM_STATUSES.has(nextStatus) &&
                    !window.confirm(`Mark this shipment "${SHIPMENT_STATUS_LABELS[nextStatus]}"?`)
                  ) {
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
                    variant: CONFIRM_STATUSES.has(nextStatus) ? "outline" : "primary",
                  })}
                >
                  {statusPending ? "Saving..." : `Mark ${SHIPMENT_STATUS_LABELS[nextStatus]}`}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No further fulfillment changes are available.</p>
        )}
        <div role="status" aria-live="polite">
          {statusState.message && (
            <p className="mt-3 text-sm text-success">{statusState.message}</p>
          )}
          {!statusState.ok && <p className="mt-3 text-sm text-danger">{statusState.error}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Tracking information</h2>
        <form action={trackingAction} className="mt-3 space-y-3">
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <FormField label="Carrier" fieldId="shipment-carrier">
            <InputControl
              id="shipment-carrier"
              name="carrier"
              defaultValue={carrier ?? ""}
              maxLength={80}
              placeholder="e.g. Local courier"
            />
          </FormField>
          <FormField label="Tracking number" fieldId="shipment-tracking">
            <InputControl
              id="shipment-tracking"
              name="trackingNumber"
              defaultValue={trackingNumber ?? ""}
              maxLength={100}
              placeholder="e.g. TRK123456789"
            />
          </FormField>
          <FormField label="Estimated delivery" fieldId="shipment-eta">
            <InputControl
              id="shipment-eta"
              name="estimatedDelivery"
              defaultValue={estimatedDelivery ?? ""}
              maxLength={80}
              placeholder="e.g. 3-5 business days"
            />
          </FormField>
          <button type="submit" disabled={trackingPending} className={buttonStyles({ size: "sm" })}>
            {trackingPending ? "Saving..." : "Save tracking"}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {trackingState.message && (
            <p className="mt-3 text-sm text-success">{trackingState.message}</p>
          )}
          {!trackingState.ok && <p className="mt-3 text-sm text-danger">{trackingState.error}</p>}
        </div>
      </section>
    </div>
  );
}
