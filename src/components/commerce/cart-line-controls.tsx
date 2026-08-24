"use client";

import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import {
  removeCartItem,
  updateCartItemQuantity,
  type CommerceState,
} from "@/lib/commerce/actions";

/**
 * Quantity stepper + remove for one cart line. Every button carries the
 * product name in its accessible name, so a screen-reader user always
 * knows which line they are changing.
 */
export function CartLineControls({
  itemId,
  productName,
  quantity,
  max,
}: {
  itemId: string;
  productName: string;
  quantity: number;
  max: number;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function run(action: () => Promise<CommerceState>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-full border border-navy-200 p-1">
        <IconButton
          label={`Decrease quantity of ${productName}`}
          size="sm"
          disabled={isPending || quantity <= 1}
          onClick={() => run(() => updateCartItemQuantity(itemId, quantity - 1))}
        >
          <Minus className="size-4" aria-hidden />
        </IconButton>
        <span
          className="min-w-8 text-center text-sm tabular-nums"
          aria-live="polite"
        >
          <span className="sr-only">Quantity of {productName}: </span>
          {quantity}
        </span>
        <IconButton
          label={`Increase quantity of ${productName}`}
          size="sm"
          disabled={isPending || quantity >= max}
          onClick={() => run(() => updateCartItemQuantity(itemId, quantity + 1))}
        >
          <Plus className="size-4" aria-hidden />
        </IconButton>
      </div>

      <IconButton
        label={`Remove ${productName} from your bag`}
        size="sm"
        variant="ghost"
        className="text-danger hover:bg-danger/10"
        disabled={isPending}
        onClick={() => run(() => removeCartItem(itemId))}
      >
        <Trash2 className="size-4" aria-hidden />
      </IconButton>
    </div>
  );
}
