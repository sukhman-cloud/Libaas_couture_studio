"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { removeWishlistItem } from "@/lib/commerce/actions";

export function WishlistRemove({
  itemId,
  productName,
}: {
  /** Wishlist row id — works even when the product is no longer public. */
  itemId: string;
  /** Used for the accessible name so the button says what it removes. */
  productName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-danger hover:bg-danger/10"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeWishlistItem(itemId);
          if (result.error) toast({ title: result.error, tone: "danger" });
        })
      }
    >
      <Trash2 className="size-3.5" aria-hidden />
      Remove
      <span className="sr-only"> {productName} from your wishlist</span>
    </Button>
  );
}
