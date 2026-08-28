import "server-only";
import type { Money, Product, ProductAvailability } from "@/types/domain";

/**
 * The commerce ground rules, dependency-free so both the cart service and
 * the configuration validator can share them without an import cycle.
 *
 * Purchasable availability — only these can enter a cart:
 *   available      ✓ ready at the studio
 *   made_to_order  ✓ crafted after measurements
 *   out_of_stock   ✗
 *   discontinued   ✗
 * A product must also be `published`; drafts and archived products are
 * never addable and never rendered.
 */

export const PURCHASABLE_AVAILABILITY: ProductAvailability[] = [
  "available",
  "made_to_order",
];

export const MAX_QUANTITY_PER_ITEM = 20;

export function isPurchasable(product: Product): boolean {
  return (
    product.status === "published" &&
    PURCHASABLE_AVAILABILITY.includes(product.availability)
  );
}

/** The price a customer pays today — sale price when one is set. */
export function effectivePriceOf(product: Product): Money {
  return product.salePrice ?? product.price;
}
