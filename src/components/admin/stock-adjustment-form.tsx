"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InputControl } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/components/admin/use-action-toast";
import {
  adjustStockAction,
  initialInventoryActionState,
} from "@/lib/inventory/actions";
import type { InventoryMovementType } from "@/types/domain";

const TYPE_LABELS: Record<Exclude<InventoryMovementType, "sale" | "reservation" | "reservation_release">, string> = {
  restock: "Restock",
  adjustment: "Adjustment",
  damaged: "Mark damaged",
  correction: "Correction",
  return: "Return",
  initial_stock: "Initial stock",
};

/**
 * Admin-only manual stock change (Phase 13, §10/§11). A single quantity
 * field paired with a sign selector (add/remove) keeps the form honest:
 * the movement type says WHY the quantity changed, the sign says which
 * direction — "mark damaged" always removes, everything else can go
 * either way. A fresh idempotency key is minted per render, mirroring the
 * checkout confirm form, so a double-click or browser retry can never
 * apply the same adjustment twice.
 */
export function StockAdjustmentForm({
  productId,
  idempotencyKey,
}: {
  productId: string;
  /** Minted server-side per render by the parent page (see
   *  generateInventoryIdempotencyKey in server/inventory/service.ts) —
   *  this component cannot import a "server-only" module itself. */
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(
    adjustStockAction,
    initialInventoryActionState,
  );

  useActionToast(state);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <FormField label="Movement type" fieldId="adjustment-type">
        <Select id="adjustment-type" name="type" defaultValue="restock">
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Quantity" fieldId="adjustment-quantity" hint="Use the sign that matches the change (e.g. -5 to remove 5 units).">
        <InputControl
          id="adjustment-quantity"
          name="quantityChange"
          type="number"
          step={1}
          required
          placeholder="e.g. 10 or -5"
        />
      </FormField>

      <FormField label="Reason (optional)" fieldId="adjustment-reason">
        <Textarea
          id="adjustment-reason"
          name="reason"
          maxLength={500}
          rows={2}
          placeholder="e.g. Supplier delivery, stock count correction"
        />
      </FormField>

      <button type="submit" disabled={pending} className={buttonStyles({ size: "sm" })}>
        {pending ? "Saving..." : "Apply adjustment"}
      </button>

      <div role="status" aria-live="polite">
        {state.message && <p className="text-sm text-success">{state.message}</p>}
        {!state.ok && <p className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
