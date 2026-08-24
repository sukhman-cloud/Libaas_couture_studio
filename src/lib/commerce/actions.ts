"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";
import { withLock } from "@/server/lock";
import {
  effectivePriceOf,
  ensureCart,
  ensureWishlist,
  isPurchasable,
  MAX_QUANTITY_PER_ITEM,
} from "@/server/commerce/service";
import type { CartItem } from "@/types/domain";

/**
 * Wishlist and cart mutations.
 *
 * Identity always comes from the verified session (`getCustomerUser`) —
 * never from an id supplied by the browser. Prices are read from the
 * product record; anything price-like sent by a client is ignored. Each
 * mutation runs inside the customer's lock so concurrent updates cannot
 * interleave.
 */

export interface CommerceState {
  error?: string;
  success?: string;
}

const NOT_SIGNED_IN = "Please sign in to continue.";

/** Quantity must be a whole number within a sane range. */
function parseQuantity(value: unknown): number | null {
  const quantity = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(quantity)) return null;
  if (!Number.isInteger(quantity)) return null;
  if (quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) return null;
  return quantity;
}

function revalidateCommerce() {
  revalidatePath("/cart");
  revalidatePath("/account/wishlist");
  revalidatePath("/", "layout"); // header counts
}

/* ── wishlist ───────────────────────────────────────────────────── */

export async function addToWishlist(slug: string): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };
  if (typeof slug !== "string" || !slug) {
    return { error: "Missing product." };
  }

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    // Products are addressed by their public slug — internal ids never
    // travel to the browser.
    const product = await repos.products.getBySlug(slug);
    // Drafts and archived products can never be wishlisted, and the error
    // never reveals which of the two it was.
    if (!product || product.status !== "published") {
      return { error: "This product is not available." };
    }
    const productId = product.id;

    const wishlist = await ensureWishlist(user.id);
    // Idempotent: a repeat add is a success, not a duplicate row.
    if (wishlist.items.some((item) => item.productId === productId)) {
      return { success: "Already in your wishlist." };
    }

    const now = new Date().toISOString();
    await repos.wishlists.update({
      ...wishlist,
      items: [
        ...wishlist.items,
        { id: randomUUID(), productId, createdAt: now },
      ],
      updatedAt: now,
    });
    return { success: "Saved to your wishlist." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

/** Remove by public slug — used from the product page. */
export async function removeFromWishlist(slug: string): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const product = await repos.products.getBySlug(slug);
    // Ownership: only ever this customer's own wishlist is loaded.
    const wishlist = await repos.wishlists.getByCustomerId(user.id);
    if (!wishlist || !product) return { success: "Removed from your wishlist." };
    const productId = product.id;

    const items = wishlist.items.filter((item) => item.productId !== productId);
    if (items.length !== wishlist.items.length) {
      await repos.wishlists.update({
        ...wishlist,
        items,
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: "Removed from your wishlist." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

/**
 * Remove one saved row by its wishlist item id — used from the customer's
 * own wishlist page, where a row may point at a product that is no longer
 * public (and therefore has no reachable slug).
 */
export async function removeWishlistItem(
  itemId: string,
): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    // Ownership: the id is only matched inside this customer's wishlist.
    const wishlist = await repos.wishlists.getByCustomerId(user.id);
    if (!wishlist) return { success: "Removed from your wishlist." };

    const items = wishlist.items.filter((item) => item.id !== itemId);
    if (items.length !== wishlist.items.length) {
      await repos.wishlists.update({
        ...wishlist,
        items,
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: "Removed from your wishlist." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

export async function clearWishlist(): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const wishlist = await repos.wishlists.getByCustomerId(user.id);
    if (wishlist && wishlist.items.length > 0) {
      await repos.wishlists.update({
        ...wishlist,
        items: [],
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: "Wishlist cleared." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

/* ── cart ───────────────────────────────────────────────────────── */

export async function addToCart(
  slug: string,
  quantity: number = 1,
): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };
  if (typeof slug !== "string" || !slug) {
    return { error: "Missing product." };
  }

  const requested = parseQuantity(quantity);
  if (requested === null) {
    return { error: `Choose a quantity between 1 and ${MAX_QUANTITY_PER_ITEM}.` };
  }

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    // Addressed by public slug; the internal id stays server-side.
    const product = await repos.products.getBySlug(slug);
    if (!product || product.status !== "published") {
      return { error: "This product is not available." };
    }
    const productId = product.id;
    if (!isPurchasable(product)) {
      return {
        error:
          product.availability === "out_of_stock"
            ? "This piece is out of stock right now."
            : "This piece is no longer available.",
      };
    }

    const cart = await ensureCart(user.id);
    // Same product + same configuration = same line. `configurationKey` is
    // "" until stitching/customisation options exist (Phase 7).
    const configurationKey = "";
    const existing = cart.items.find(
      (item) =>
        item.productId === productId &&
        item.configurationKey === configurationKey,
    );

    const now = new Date().toISOString();
    let items: CartItem[];

    if (existing) {
      const nextQuantity = Math.min(
        existing.quantity + requested,
        MAX_QUANTITY_PER_ITEM,
      );
      // The original snapshot is kept — the price this line was added at
      // is what the cart shows until the customer is told it changed.
      items = cart.items.map((item) =>
        item.id === existing.id
          ? { ...item, quantity: nextQuantity, updatedAt: now }
          : item,
      );
    } else {
      items = [
        ...cart.items,
        {
          id: randomUUID(),
          productId,
          quantity: requested,
          // Price comes from the product record, never from the client.
          unitPrice: effectivePriceOf(product),
          configurationKey,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }

    await repos.carts.update({ ...cart, items, updatedAt: now });
    return { success: "Added to your bag." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const requested = parseQuantity(quantity);
  if (requested === null) {
    return { error: `Choose a quantity between 1 and ${MAX_QUANTITY_PER_ITEM}.` };
  }

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByCustomerId(user.id);
    // Ownership: the item id is only ever matched inside this customer's
    // own cart, so another customer's line can never be touched.
    if (!cart || !cart.items.some((item) => item.id === itemId)) {
      return { error: "That item is no longer in your bag." };
    }

    const now = new Date().toISOString();
    await repos.carts.update({
      ...cart,
      items: cart.items.map((item) =>
        item.id === itemId
          ? { ...item, quantity: requested, updatedAt: now }
          : item,
      ),
      updatedAt: now,
    });
    return { success: "Quantity updated." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

export async function removeCartItem(itemId: string): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByCustomerId(user.id);
    if (!cart) return { success: "Removed from your bag." };

    const items = cart.items.filter((item) => item.id !== itemId);
    if (items.length !== cart.items.length) {
      await repos.carts.update({
        ...cart,
        items,
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: "Removed from your bag." };
  });

  if (result.success) revalidateCommerce();
  return result;
}

export async function clearCart(): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };

  const result = await withLock(`customer:${user.id}`, async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByCustomerId(user.id);
    if (cart && cart.items.length > 0) {
      await repos.carts.update({
        ...cart,
        items: [],
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: "Bag cleared." };
  });

  if (result.success) revalidateCommerce();
  return result;
}
