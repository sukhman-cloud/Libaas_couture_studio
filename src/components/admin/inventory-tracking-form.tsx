"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InputControl } from "@/components/ui/input";
import {
  initialInventoryActionState,
  setInventoryTrackingAction,
} from "@/lib/inventory/actions";

/**
 * Admin-only: enable/disable stock tracking for a product and set its
 * low-stock threshold (Phase 13, §12). Disabling tracking does not delete
 * quantities or history — it only stops the inventory gate from applying
 * to checkout; re-enabling resumes with whatever was last recorded.
 */
export function InventoryTrackingForm({
  productId,
  trackingEnabled,
  lowStockThreshold,
}: {
  productId: string;
  trackingEnabled: boolean;
  lowStockThreshold: number;
}) {
  const [state, action, pending] = useActionState(
    setInventoryTrackingAction,
    initialInventoryActionState,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />

      <label className="flex items-center gap-2 text-sm text-navy-800">
        <input
          type="checkbox"
          name="trackingEnabled"
          value="true"
          defaultChecked={trackingEnabled}
          className="size-4 rounded border-navy-200"
        />
        Track stock for this product
      </label>

      <FormField
        label="Low-stock threshold"
        fieldId="tracking-threshold"
        hint="Admin shows this product as low stock at or below this available quantity."
      >
        <InputControl
          id="tracking-threshold"
          name="lowStockThreshold"
          type="number"
          min={0}
          step={1}
          defaultValue={lowStockThreshold}
        />
      </FormField>

      <button type="submit" disabled={pending} className={buttonStyles({ size: "sm", variant: "outline" })}>
        {pending ? "Saving..." : "Save tracking settings"}
      </button>

      <div role="status" aria-live="polite">
        {state.message && <p className="text-sm text-success">{state.message}</p>}
        {!state.ok && <p className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
