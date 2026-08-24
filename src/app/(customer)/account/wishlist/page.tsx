import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card";
import { ClearButton } from "@/components/commerce/clear-button";
import { WishlistRemove } from "@/components/commerce/wishlist-remove";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Text } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getWishlistEntries } from "@/server/commerce/service";

export const metadata: Metadata = {
  title: "Wishlist",
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=%2Faccount%2Fwishlist");

  const entries = await getWishlistEntries(user.id);

  return (
    <div>
      <PageHeader
        title="Wishlist"
        description="Pieces you have saved. They stay here across devices."
        actions={entries.length > 0 ? <ClearButton target="wishlist" /> : undefined}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save pieces you love and find them here later."
          action={
            <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
              Continue shopping
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.itemId} className="flex min-w-0 flex-col">
              {entry.card ? (
                <>
                  <ProductCard product={entry.card} />
                  <div className="mt-2">
                    <WishlistRemove
                      itemId={entry.itemId}
                      productName={entry.card.name}
                    />
                  </div>
                </>
              ) : (
                // The product is no longer public. The saved reference is
                // kept, but nothing about a private product is revealed.
                <div className="flex h-full flex-col justify-between rounded-2xl border border-dashed border-navy-200 p-4">
                  <Text tone="muted" size="sm">
                    This piece is no longer available.
                  </Text>
                  <div className="mt-3">
                    <WishlistRemove
                      itemId={entry.itemId}
                      productName="this piece"
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
