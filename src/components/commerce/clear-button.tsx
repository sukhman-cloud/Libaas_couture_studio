"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/components/ui/toast";
import { clearCart, clearWishlist } from "@/lib/commerce/actions";

/**
 * "Clear everything" for the bag or the wishlist. Destructive, so it always
 * asks first using the shared confirmation dialog.
 */
export function ClearButton({ target }: { target: "cart" | "wishlist" }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const copy =
    target === "cart"
      ? {
          label: "Clear bag",
          title: "Empty your bag?",
          description:
            "Every piece will be removed from your bag. Your wishlist is not affected.",
        }
      : {
          label: "Clear wishlist",
          title: "Clear your wishlist?",
          description:
            "Every saved piece will be removed. Your bag is not affected.",
        };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger/10"
        disabled={isPending}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-3.5" aria-hidden />
        {copy.label}
      </Button>

      <ConfirmationDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => {
            const result =
              target === "cart" ? await clearCart() : await clearWishlist();
            if (result.error) toast({ title: result.error, tone: "danger" });
            else if (result.success)
              toast({ title: result.success, tone: "success" });
          });
        }}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.label}
        destructive
        isConfirming={isPending}
      />
    </>
  );
}
