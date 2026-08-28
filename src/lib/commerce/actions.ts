"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getCustomerUser } from "@/lib/auth/customer-session";
import {
  parseConfigurationInput,
  validateCartConfiguration,
} from "@/server/cart/configuration";
import { getRepositories } from "@/server/data";
import { customerLockKey, withLock } from "@/server/lock";
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const product = await repos.products.getBySlug(slug);
    // Ownership: only ever this customer's own wishlist is loaded.
    const wishlist = await repos.wishlists.getByUserId(user.id);
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    // Ownership: the id is only matched inside this customer's wishlist.
    const wishlist = await repos.wishlists.getByUserId(user.id);
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const wishlist = await repos.wishlists.getByUserId(user.id);
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

/**
 * Add a product to the bag, optionally with a stitching configuration
 * (Phase 7A). Omitting `configuration` keeps the pre-7A behavior: the
 * default unstitched line (`configurationKey: ""`), merging with any
 * legacy line for the same product.
 *
 * The browser only PROPOSES `{ stitching, measurementProfileId }`; the
 * single validator re-derives everything (product capability, profile
 * ownership + liveness, the configuration key). Same product + same
 * configuration merges quantities; a different configuration creates a
 * separate line — backed in PostgreSQL by the unique
 * `(cart_id, product_id, configuration_key)` constraint.
 */
export async function addToCart(
  slug: string,
  quantity: number = 1,
  configuration?: unknown,
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

  const input = parseConfigurationInput(configuration);
  if (input === null) {
    return { error: "That configuration is not valid." };
  }

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
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

    // The ONE configuration validator (§20) — recomputes the key and
    // resolves the measurement profile with ownership checks inside the
    // customer lock.
    const validated = await validateCartConfiguration({
      userId: user.id,
      product,
      input,
      repos,
    });
    if (!validated.ok) return { error: validated.message };
    const { configurationKey, stitching } = validated.config;

    const cart = await ensureCart(user.id);
    // Same product + same configuration = same line.
    const existing = cart.items.find(
      (item) =>
        item.productId === productId &&
        item.configurationKey === configurationKey,
    );

    const now = new Date().toISOString();
    let items: CartItem[];
    let capped = false;

    if (existing) {
      // Never a silent discard: at the per-item maximum the customer is
      // TOLD, not shown a success for pieces that were never added.
      if (existing.quantity >= MAX_QUANTITY_PER_ITEM) {
        return {
          error: `Your bag already holds the maximum of ${MAX_QUANTITY_PER_ITEM} for this piece and configuration.`,
        };
      }
      const nextQuantity = Math.min(
        existing.quantity + requested,
        MAX_QUANTITY_PER_ITEM,
      );
      capped = nextQuantity < existing.quantity + requested;
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
          // A configuration never changes the price — no stitching fee
          // exists in the product model, so none is invented.
          unitPrice: effectivePriceOf(product),
          configurationKey,
          ...(stitching === undefined ? {} : { stitching }),
          createdAt: now,
          updatedAt: now,
        },
      ];
    }

    await repos.carts.update({ ...cart, items, updatedAt: now });
    if (capped) {
      return {
        success: `Added to your bag — capped at the maximum of ${MAX_QUANTITY_PER_ITEM}.`,
      };
    }
    return {
      success: stitching
        ? "Added to your bag with stitching."
        : "Added to your bag.",
    };
  });

  if (result.success) revalidateCommerce();
  return result;
}

/**
 * Change an existing line's stitching configuration (§21) — e.g.
 * Unstitched → Stitched with profile A, or between two profiles.
 *
 * If the new configuration matches ANOTHER line of the same product, the
 * two lines merge: the target keeps its identity and price snapshot and
 * the quantities are added. A merge that would exceed the per-item
 * maximum is REFUSED rather than silently capped — an explicit
 * configuration change must never quietly discard quantity (§22).
 * The whole rewrite is one atomic cart write under the customer lock.
 */
export async function updateCartItemConfiguration(
  itemId: string,
  configuration: unknown,
): Promise<CommerceState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };
  if (typeof itemId !== "string" || !itemId) {
    return { error: "Missing item." };
  }

  const input = parseConfigurationInput(configuration);
  if (input === null) {
    return { error: "That configuration is not valid." };
  }

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    // Ownership: the line must exist inside THIS customer's cart.
    const cart = await repos.carts.getByUserId(user.id);
    const item = cart?.items.find((entry) => entry.id === itemId);
    if (!cart || !item) return { error: "That item is no longer in your bag." };

    const product = await repos.products.getById(item.productId);
    if (!product || product.status !== "published" || !isPurchasable(product)) {
      return {
        error:
          "This piece is no longer available, so its configuration cannot be changed. Remove it instead.",
      };
    }

    const validated = await validateCartConfiguration({
      userId: user.id,
      product,
      input,
      repos,
    });
    if (!validated.ok) return { error: validated.message };
    const { configurationKey, stitching } = validated.config;

    // NOTE: a same-key change deliberately falls through to the rewrite
    // branch (the key invariant means no OTHER line can match it), so the
    // stored stitching object is re-normalised from the validated
    // configuration even if it had drifted.

    const now = new Date().toISOString();
    const target = cart.items.find(
      (entry) =>
        entry.id !== item.id &&
        entry.productId === item.productId &&
        entry.configurationKey === configurationKey,
    );

    let items: CartItem[];
    if (target) {
      // The price-acknowledgement discipline (§4, Phase 6A) must survive
      // merging: quantity may only move onto a line whose price SNAPSHOT
      // is identical, or pieces would silently change price without the
      // customer ever accepting it.
      if (
        target.unitPrice.amount !== item.unitPrice.amount ||
        target.unitPrice.currency !== item.unitPrice.currency
      ) {
        return {
          error:
            "These lines carry different prices from when they were added. Review the price change first, then update the configuration.",
        };
      }
      const combined = target.quantity + item.quantity;
      if (combined > MAX_QUANTITY_PER_ITEM) {
        return {
          error: `Your bag already holds this configuration — together that would exceed ${MAX_QUANTITY_PER_ITEM} pieces. Adjust the quantities first.`,
        };
      }
      // Merge: the target line keeps its identity and price snapshot;
      // the reconfigured line's quantity moves across, nothing is lost.
      items = cart.items
        .filter((entry) => entry.id !== item.id)
        .map((entry) =>
          entry.id === target.id
            ? { ...entry, quantity: combined, updatedAt: now }
            : entry,
        );
    } else {
      // Rewrite in place — identity, creation time and price snapshot
      // stay; only the configuration changes. Rebuilt explicitly so a
      // previous stitching object can never linger on an unstitched line.
      items = cart.items.map((entry) => {
        if (entry.id !== item.id) return entry;
        const updated: CartItem = {
          id: entry.id,
          productId: entry.productId,
          quantity: entry.quantity,
          unitPrice: entry.unitPrice,
          configurationKey,
          ...(stitching === undefined ? {} : { stitching }),
          ...(entry.customizationRequestId === undefined
            ? {}
            : { customizationRequestId: entry.customizationRequestId }),
          ...(entry.notes === undefined ? {} : { notes: entry.notes }),
          createdAt: entry.createdAt,
          updatedAt: now,
        };
        return updated;
      });
    }

    await repos.carts.update({ ...cart, items, updatedAt: now });
    return { success: "Configuration updated." };
  });

  if (result.success) {
    revalidateCommerce();
    revalidatePath("/checkout"); // the checkout review renders configurations
  }
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByUserId(user.id);
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByUserId(user.id);
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

  const result = await withLock(customerLockKey(user.id), async (): Promise<CommerceState> => {
    const repos = getRepositories();
    const cart = await repos.carts.getByUserId(user.id);
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
