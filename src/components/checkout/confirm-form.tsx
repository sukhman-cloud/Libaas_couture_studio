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
 * The place-order step (Phase 6C). The form carries ONLY the selected
 * address id and the server-minted idempotency key — every price,
 * quantity and availability decision is recomputed inside the order
 * transaction. The key makes a double-click, refresh-retry or network
 * retry return the SAME order instead of creating another; disabling the
 * button below is UX, never the guarantee.
 */
export function ConfirmForm({
  addressId,
  idempotencyKey,
  disabled,
  disabledReason,
}: {
  addressId: string | null;
  idempotencyKey: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    confirmCheckout,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {/* Server re-validates ownership of these; nothing else is read. */}
      {addressId && <input type="hidden" name="addressId" value={addressId} />}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div aria-live="polite">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
      </div>

      <Button
        type="submit"
        className="w-full"
        isLoading={isPending}
        disabled={disabled}
      >
        {isPending ? "Placing your order…" : "Place order"}
      </Button>
      {disabled && disabledReason && (
        <Text tone="muted" size="sm" role="status">
          {disabledReason}
        </Text>
      )}
      <Text tone="muted" size="sm">
        No payment is taken online — the studio confirms payment and
        delivery with you after the order is placed.
      </Text>
    </form>
  );
}
