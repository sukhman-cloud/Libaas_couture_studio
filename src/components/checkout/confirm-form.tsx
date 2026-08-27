"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  confirmCheckout,
  type CheckoutFormState,
} from "@/lib/checkout/actions";

const initialState: CheckoutFormState = {};

/**
 * The final-confirmation step. The form carries ONLY the selected address
 * id — every price, quantity and availability decision is recomputed
 * server-side by the confirm action, which creates nothing yet (Phase 6B
 * replaces its success path with the real order transaction).
 */
export function ConfirmForm({
  addressId,
  disabled,
  disabledReason,
}: {
  addressId: string | null;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    confirmCheckout,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {/* Server re-validates ownership of this id; nothing else is read. */}
      {addressId && <input type="hidden" name="addressId" value={addressId} />}

      <div aria-live="polite">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
      </div>

      <Button
        type="submit"
        className="w-full"
        isLoading={isPending}
        disabled={disabled}
      >
        Confirm details
      </Button>
      {disabled && disabledReason && (
        <Text tone="muted" size="sm" role="status">
          {disabledReason}
        </Text>
      )}
      <Text tone="muted" size="sm">
        Confirming reviews your details — no order is placed and nothing is
        charged. Online order placement opens in an upcoming update.
      </Text>
    </form>
  );
}
