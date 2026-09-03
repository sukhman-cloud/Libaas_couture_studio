"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { createCustomizationAction, type CustomizationActionState } from "@/lib/customization/actions";

export function CustomizationRequestForm({
  productSlug,
  orderNumber,
  orderItemId,
}: {
  productSlug?: string;
  orderNumber?: string;
  orderItemId?: string;
}) {
  const [state, action, pending] = useActionState<CustomizationActionState, FormData>(createCustomizationAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {productSlug && <input type="hidden" name="productSlug" value={productSlug} />}
      {orderNumber && <input type="hidden" name="orderNumber" value={orderNumber} />}
      {orderItemId && <input type="hidden" name="orderItemId" value={orderItemId} />}
      <FormField label="What would you like changed?" fieldId="customization-details" required error={state.error} hint="Please describe the fit, fabric, colour, embroidery, or stitching request.">
        <Textarea id="customization-details" name="details" required maxLength={1000} placeholder="For example: Please make the sleeves slightly looser." />
      </FormField>
      {state.success && <p className="text-sm text-success" role="status">{state.success}</p>}
      <button type="submit" disabled={pending} className={buttonStyles({ size: "sm" })}>
        {pending ? "Sending..." : "Send request"}
      </button>
    </form>
  );
}
