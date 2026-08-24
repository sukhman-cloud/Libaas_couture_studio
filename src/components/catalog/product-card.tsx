import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Caption } from "@/components/ui/typography";
import { cn, formatPrice } from "@/lib/utils";
import type { Product, ProductAvailability } from "@/types/domain";

/**
 * Customer product card. Rendered on the server — no client JS — and fed
 * the same Product the admin catalog uses (no second model).
 *
 * Visual priority: image → name → price → availability/service info.
 */

export interface ProductCardData {
  slug: string;
  name: string;
  price: Product["price"];
  salePrice?: Product["salePrice"];
  availability: ProductAvailability;
  isFeatured: boolean;
  stitchingAvailable: boolean;
  customizationAvailable: boolean;
  categoryName?: string;
  /** Media asset id + alt for the primary image, when the product has one. */
  image?: { mediaId: string; alt: string };
}

/** Availability worth surfacing on a card; "available" is the norm. */
const availabilityNote: Partial<Record<ProductAvailability, string>> = {
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
};

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData;
  /** Set for the first row so the largest image is not lazy-loaded. */
  priority?: boolean;
}) {
  const note = availabilityNote[product.availability];
  const onSale =
    product.salePrice !== undefined &&
    product.salePrice.amount < product.price.amount;

  return (
    <article className="group flex h-full flex-col">
      <Link
        href={`/products/${product.slug}`}
        className="flex h-full flex-col rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
      >
        {/* Fixed ratio keeps every card the same height — no layout shift. */}
        <div className="relative aspect-3/4 w-full overflow-hidden rounded-2xl bg-cream-100">
          {product.image ? (
            <Image
              src={`/api/media/${product.image.mediaId}`}
              alt={product.image.alt || product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted"
              aria-hidden
            >
              <ImageOff className="size-6" />
              <span className="text-xs">Photo coming soon</span>
            </div>
          )}

          {(product.isFeatured || onSale) && (
            <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {onSale && <Badge tone="gold">Sale</Badge>}
              {product.isFeatured && <Badge tone="navy">Featured</Badge>}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 pt-3">
          {product.categoryName && (
            <Caption className="uppercase tracking-widest">
              {product.categoryName}
            </Caption>
          )}

          <h3 className="wrap-break-word font-display text-lg leading-snug font-medium text-navy-800">
            {product.name}
          </h3>

          <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "tabular-nums font-medium",
                onSale ? "text-danger" : "text-navy-800",
              )}
            >
              {formatPrice(
                (onSale ? product.salePrice! : product.price).amount,
                product.price.currency,
              )}
            </span>
            {onSale && (
              <span className="text-sm text-muted line-through tabular-nums">
                {formatPrice(product.price.amount, product.price.currency)}
              </span>
            )}
          </p>

          {(note ||
            product.stitchingAvailable ||
            product.customizationAvailable) && (
            <p className="mt-1 text-xs text-muted">
              {[
                note,
                product.stitchingAvailable ? "Stitching available" : null,
                product.customizationAvailable ? "Customisable" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
