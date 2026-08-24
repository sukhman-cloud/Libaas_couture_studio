"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  addToCart,
  addToWishlist,
  removeFromWishlist,
  type CommerceState,
} from "@/lib/commerce/actions";
import { cn } from "@/lib/utils";

/**
 * Add-to-bag and wishlist controls for the product page.
 *
 * Signed-out customers are sent to sign in rather than shown a control
 * that silently does nothing. `purchasable` comes from the server, so an
 * out-of-stock piece never offers an add button.
 */
export function ProductActions({
  slug,
  purchasable,
  signedIn,
  initiallyWishlisted,
  returnTo,
}: {
  /** Public identifier — the internal product id never reaches the client. */
  slug: string;
  purchasable: boolean;
  signedIn: boolean;
  initiallyWishlisted: boolean;
  /** Path to come back to after signing in. */
  returnTo: string;
}) {
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function requireSignIn() {
    router.push(`/login?from=${encodeURIComponent(returnTo)}`);
  }

  function run(action: () => Promise<CommerceState>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else {
        if (result.success) toast({ title: result.success, tone: "success" });
        onDone?.();
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      {purchasable && (
        <Button
          isLoading={isPending}
          onClick={() =>
            signedIn ? run(() => addToCart(slug, 1)) : requireSignIn()
          }
        >
          <ShoppingBag className="size-4" aria-hidden />
          Add to bag
        </Button>
      )}

      <Button
        variant="outline"
        disabled={isPending}
        aria-pressed={signedIn ? wishlisted : undefined}
        onClick={() => {
          if (!signedIn) return requireSignIn();
          if (wishlisted) {
            run(() => removeFromWishlist(slug), () => setWishlisted(false));
          } else {
            run(() => addToWishlist(slug), () => setWishlisted(true));
          }
        }}
      >
        <Heart
          className={cn("size-4", wishlisted && "fill-current text-danger")}
          aria-hidden
        />
        {wishlisted ? "Saved" : "Save to wishlist"}
      </Button>
    </div>
  );
}
