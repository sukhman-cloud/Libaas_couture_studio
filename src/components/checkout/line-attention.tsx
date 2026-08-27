"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { acceptPriceChange } from "@/lib/checkout/actions";
import { removeCartItem } from "@/lib/commerce/actions";

/**
 * Controls for a cart line that blocks checkout: accept the new price
 * (explicit acknowledgement — the server re-reads the product's current
 * price; nothing is ever updated silently) or remove the line via the
 * existing bag action.
 */
export function LineAttention({
  itemId,
  productName,
  showAcceptPrice,
  displayedPrice,
}: {
  itemId: string;
  productName: string;
  showAcceptPrice: boolean;
  /** The current price rendered next to the accept button — sent back as
   *  the consent witness so a stale tab can never accept an unseen price. */
  displayedPrice?: { amount: number; currency: string };
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const run = (task: () => Promise<{ error?: string; success?: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) toast({ title: result.success, tone: "success" });
    });

  return (
    <div className="flex flex-wrap gap-2">
      {showAcceptPrice && displayedPrice && (
        <Button
          disabled={isPending}
          onClick={() => run(() => acceptPriceChange(itemId, displayedPrice))}
        >
          Use the new price
        </Button>
      )}
      <Button
        variant="outline"
        disabled={isPending}
        aria-label={`Remove ${productName} from your bag`}
        onClick={() => run(() => removeCartItem(itemId))}
      >
        Remove from bag
      </Button>
    </div>
  );
}
