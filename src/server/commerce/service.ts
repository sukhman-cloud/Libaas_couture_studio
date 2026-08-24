import "server-only";
import type { ProductCardData } from "@/components/catalog/product-card";
import { primaryMediaOf } from "@/server/catalog/public";
import { getRepositories } from "@/server/data";
import type {
  Cart,
  CartItem,
  Money,
  Product,
  ProductAvailability,
  Wishlist,
} from "@/types/domain";

/**
 * Wishlist and cart reads.
 *
 * DOCUMENTED RULES
 *
 * Purchasable availability — only these can enter a cart:
 *   available      ✓ ready at the studio
 *   made_to_order  ✓ crafted after measurements
 *   out_of_stock   ✗
 *   discontinued   ✗
 * A product must also be `published`; drafts and archived products are
 * never addable and never rendered.
 *
 * Price snapshot — a line captures the product's effective price (sale
 * price when set) at the moment it is created, and keeps it. Reads compare
 * the snapshot with the live price and report `priceChanged`, so the
 * customer is told before checkout rather than silently re-charged.
 *
 * Lines whose product later becomes unpublished/archived/unpurchasable are
 * NEVER silently deleted or silently purchasable: the row is preserved,
 * flagged `unavailable`, excluded from the subtotal, and rendered without
 * any private product detail.
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

/* ── cart ───────────────────────────────────────────────────────── */

export interface CartLine {
  itemId: string;
  productId: string;
  quantity: number;
  /** Captured when the line was created. */
  unitPrice: Money;
  /** quantity × unitPrice, in integer paise. */
  lineTotal: Money;
  /** Present while the product is publicly visible. */
  product?: {
    slug: string;
    name: string;
    availability: ProductAvailability;
    image?: { mediaId: string; alt: string };
    currentPrice: Money;
  };
  /** Product is gone, unpublished, or no longer purchasable. */
  unavailable: boolean;
  /** Live price differs from the snapshot this line will be charged at. */
  priceChanged: boolean;
}

export interface CartView {
  lines: CartLine[];
  /** Sum of purchasable lines only. */
  subtotal: Money;
  /** No shipping/tax/discounts yet — total equals subtotal in this phase. */
  total: Money;
  /** Number of distinct lines (purchasable + unavailable). */
  itemCount: number;
  /** Sum of quantities across purchasable lines. */
  totalQuantity: number;
  unavailableCount: number;
}

export const EMPTY_CART_VIEW: CartView = {
  lines: [],
  subtotal: { amount: 0, currency: "INR" },
  total: { amount: 0, currency: "INR" },
  itemCount: 0,
  totalQuantity: 0,
  unavailableCount: 0,
};

async function resolveLine(item: CartItem): Promise<CartLine> {
  const product = await getRepositories().products.getById(item.productId);
  const visible = product && product.status === "published" ? product : null;
  const purchasable = visible !== null && isPurchasable(visible);
  const currentPrice = visible ? effectivePriceOf(visible) : undefined;

  return {
    itemId: item.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    // Integer arithmetic only — paise multiplied by a whole quantity.
    lineTotal: {
      amount: item.unitPrice.amount * item.quantity,
      currency: item.unitPrice.currency,
    },
    product: visible
      ? {
          slug: visible.slug,
          name: visible.name,
          availability: visible.availability,
          image: (() => {
            const media = primaryMediaOf(visible);
            return media
              ? { mediaId: media.mediaId, alt: media.alt || visible.name }
              : undefined;
          })(),
          currentPrice: currentPrice!,
        }
      : undefined,
    unavailable: !purchasable,
    priceChanged:
      purchasable && currentPrice !== undefined
        ? currentPrice.amount !== item.unitPrice.amount
        : false,
  };
}

export function summariseCart(lines: CartLine[]): CartView {
  const priced = lines.filter((line) => !line.unavailable);
  const subtotal = priced.reduce((sum, line) => sum + line.lineTotal.amount, 0);
  return {
    lines,
    subtotal: { amount: subtotal, currency: "INR" },
    total: { amount: subtotal, currency: "INR" },
    itemCount: lines.length,
    totalQuantity: priced.reduce((sum, line) => sum + line.quantity, 0),
    unavailableCount: lines.length - priced.length,
  };
}

/** The signed-in customer's cart, with products resolved. */
export async function getCartView(customerId: string): Promise<CartView> {
  const cart = await getRepositories().carts.getByCustomerId(customerId);
  if (!cart || cart.items.length === 0) return EMPTY_CART_VIEW;

  const ordered = [...cart.items].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const lines = await Promise.all(ordered.map(resolveLine));
  return summariseCart(lines);
}

/** Cheap badge count: total quantity of purchasable lines. */
export async function getCartCount(customerId: string): Promise<number> {
  const view = await getCartView(customerId);
  return view.totalQuantity;
}

/** Find or create the customer's single active cart. */
export async function ensureCart(customerId: string): Promise<Cart> {
  const repos = getRepositories();
  const existing = await repos.carts.getByCustomerId(customerId);
  if (existing) return existing;

  const now = new Date().toISOString();
  return repos.carts.create({
    id: crypto.randomUUID(),
    customerId,
    items: [],
    createdAt: now,
    updatedAt: now,
  });
}

/* ── wishlist ───────────────────────────────────────────────────── */

export interface WishlistEntry {
  itemId: string;
  productId: string;
  /** Absent when the product is no longer public — nothing private leaks. */
  card?: ProductCardData;
  unavailable: boolean;
}

export async function getWishlistEntries(
  customerId: string,
): Promise<WishlistEntry[]> {
  const repos = getRepositories();
  const wishlist = await repos.wishlists.getByCustomerId(customerId);
  if (!wishlist || wishlist.items.length === 0) return [];

  const categories = await repos.categories.list();
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const ordered = [...wishlist.items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return Promise.all(
    ordered.map(async (item) => {
      const product = await repos.products.getById(item.productId);
      const visible = product && product.status === "published" ? product : null;
      if (!visible) {
        return { itemId: item.id, productId: item.productId, unavailable: true };
      }
      const media = primaryMediaOf(visible);
      return {
        itemId: item.id,
        productId: item.productId,
        unavailable: false,
        card: {
          slug: visible.slug,
          name: visible.name,
          price: visible.price,
          salePrice: visible.salePrice,
          availability: visible.availability,
          isFeatured: visible.isFeatured,
          stitchingAvailable: visible.stitchingAvailable,
          customizationAvailable: visible.customizationAvailable,
          categoryName: visible.categoryId
            ? categoryNames.get(visible.categoryId)
            : undefined,
          image: media
            ? { mediaId: media.mediaId, alt: media.alt || visible.name }
            : undefined,
        },
      } satisfies WishlistEntry;
    }),
  );
}

/** Badge count: wishlisted products, including any now unavailable. */
export async function getWishlistCount(customerId: string): Promise<number> {
  const wishlist = await getRepositories().wishlists.getByCustomerId(customerId);
  return wishlist?.items.length ?? 0;
}

export async function isWishlisted(
  customerId: string,
  productId: string,
): Promise<boolean> {
  const wishlist = await getRepositories().wishlists.getByCustomerId(customerId);
  return Boolean(wishlist?.items.some((item) => item.productId === productId));
}

export async function ensureWishlist(customerId: string): Promise<Wishlist> {
  const repos = getRepositories();
  const existing = await repos.wishlists.getByCustomerId(customerId);
  if (existing) return existing;

  const now = new Date().toISOString();
  return repos.wishlists.create({
    id: crypto.randomUUID(),
    customerId,
    items: [],
    createdAt: now,
    updatedAt: now,
  });
}
