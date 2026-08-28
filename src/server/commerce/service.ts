import "server-only";
import type { ProductCardData } from "@/components/catalog/product-card";
import {
  checkCartLineConfiguration,
  itemHasConfiguration,
  type LineConfigurationIssue,
} from "@/server/cart/configuration";
import { primaryMediaOf } from "@/server/catalog/public";
import { getRepositories } from "@/server/data";
import type {
  Cart,
  CartItem,
  Money,
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

// The ground rules live in ./rules (shared with the configuration
// validator, cycle-free) and are re-exported so every existing import
// site keeps working unchanged.
import { effectivePriceOf, isPurchasable } from "./rules";

export {
  effectivePriceOf,
  isPurchasable,
  MAX_QUANTITY_PER_ITEM,
  PURCHASABLE_AVAILABILITY,
} from "./rules";

/* ── cart ───────────────────────────────────────────────────────── */

/**
 * What the line's configuration means for the UI (Phase 7A). Internal
 * `configurationKey` and profile ids stay server-side; only the
 * customer's own profile label travels.
 */
export interface CartLineConfiguration {
  /** The line was configured with studio stitching. */
  stitched: boolean;
  /** Label of the measurement profile, when it still resolves. */
  measurementProfileLabel?: string;
  /** The customer's own profile row id — needed by the cart's
   *  configuration control to preselect the current choice. */
  measurementProfileId?: string;
  /** Set when the stored configuration no longer holds (§23) — the line
   *  is preserved, flagged, and blocks checkout until resolved. */
  issue?: LineConfigurationIssue;
  /** Any reserved Phase-7 field is present (badge indicator). */
  hasConfiguration: boolean;
}

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
    /** The product still offers studio stitching (drives the cart's
     *  configuration control). */
    stitchingAvailable: boolean;
  };
  /** Product is gone, unpublished, or no longer purchasable. */
  unavailable: boolean;
  /** Live price differs from the snapshot this line will be charged at. */
  priceChanged: boolean;
  configuration: CartLineConfiguration;
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
  /** Purchasable lines whose stitching configuration needs attention
   *  (archived profile etc.) — they block checkout until resolved. */
  configurationIssueCount: number;
}

export const EMPTY_CART_VIEW: CartView = {
  lines: [],
  subtotal: { amount: 0, currency: "INR" },
  total: { amount: 0, currency: "INR" },
  itemCount: 0,
  totalQuantity: 0,
  unavailableCount: 0,
  configurationIssueCount: 0,
};

async function resolveLine(item: CartItem, userId: string): Promise<CartLine> {
  const product = await getRepositories().products.getById(item.productId);
  const visible = product && product.status === "published" ? product : null;
  const purchasable = visible !== null && isPurchasable(visible);
  const currentPrice = visible ? effectivePriceOf(visible) : undefined;

  // Configuration health (Phase 7A): resolve the stitching selection and
  // its measurement profile — ownership re-checked on every read.
  const configCheck = await checkCartLineConfiguration({
    userId,
    item,
    product: visible,
  });
  const configuration: CartLineConfiguration = {
    stitched: item.stitching?.selected === true,
    ...(configCheck.profile
      ? {
          measurementProfileLabel: configCheck.profile.label,
          measurementProfileId: configCheck.profile.id,
        }
      : {}),
    ...(configCheck.ok ? {} : { issue: configCheck.issue }),
    hasConfiguration: itemHasConfiguration(item),
  };

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
          stitchingAvailable: visible.stitchingAvailable,
        }
      : undefined,
    unavailable: !purchasable,
    priceChanged:
      purchasable && currentPrice !== undefined
        ? currentPrice.amount !== item.unitPrice.amount
        : false,
    configuration,
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
    // Unavailable lines already block on their own; configuration issues
    // are counted for lines that would otherwise be orderable.
    configurationIssueCount: priced.filter(
      (line) => line.configuration.issue !== undefined,
    ).length,
  };
}

/** The signed-in customer's cart, with products resolved. */
export async function getCartView(userId: string): Promise<CartView> {
  const cart = await getRepositories().carts.getByUserId(userId);
  if (!cart || cart.items.length === 0) return EMPTY_CART_VIEW;

  const ordered = [...cart.items].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const lines = await Promise.all(
    ordered.map((item) => resolveLine(item, userId)),
  );
  return summariseCart(lines);
}

/** Cheap badge count: total quantity of purchasable lines. */
export async function getCartCount(userId: string): Promise<number> {
  const view = await getCartView(userId);
  return view.totalQuantity;
}

/** Find or create the customer's single active cart. */
export async function ensureCart(userId: string): Promise<Cart> {
  const repos = getRepositories();
  const existing = await repos.carts.getByUserId(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  try {
    return await repos.carts.create({
      id: crypto.randomUUID(),
      userId,
      items: [],
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    // Cross-process first-cart race: another instance created the cart
    // between our read and write (the one-cart-per-user unique
    // constraint fired). The winner's cart is the cart.
    const raced = await repos.carts.getByUserId(userId);
    if (raced) return raced;
    throw error;
  }
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
  userId: string,
): Promise<WishlistEntry[]> {
  const repos = getRepositories();
  const wishlist = await repos.wishlists.getByUserId(userId);
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
export async function getWishlistCount(userId: string): Promise<number> {
  const wishlist = await getRepositories().wishlists.getByUserId(userId);
  return wishlist?.items.length ?? 0;
}

export async function isWishlisted(
  userId: string,
  productId: string,
): Promise<boolean> {
  const wishlist = await getRepositories().wishlists.getByUserId(userId);
  return Boolean(wishlist?.items.some((item) => item.productId === productId));
}

export async function ensureWishlist(userId: string): Promise<Wishlist> {
  const repos = getRepositories();
  const existing = await repos.wishlists.getByUserId(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  return repos.wishlists.create({
    id: crypto.randomUUID(),
    userId,
    items: [],
    createdAt: now,
    updatedAt: now,
  });
}
