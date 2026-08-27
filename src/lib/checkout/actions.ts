"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { saveAddress, type AccountFormState } from "@/lib/account/actions";
import {
  getCheckoutView,
  validateCheckoutAddress,
} from "@/server/checkout/service";
import { effectivePriceOf, isPurchasable } from "@/server/commerce/service";
import { getRepositories } from "@/server/data";
import { customerLockKey, withLock } from "@/server/lock";

/**
 * Checkout mutations (Phase 6A).
 *
 * Identity always comes from the verified session; the ONLY value trusted
 * from a form is an address id, and only after ownership validation in the
 * checkout service. Prices, subtotals, product ids, quantities and
 * availability sent by a browser are never read — the server recomputes
 * everything. No Order is created anywhere here (Phase 6B).
 */

export interface CheckoutFormState {
  error?: string;
  success?: string;
}

const NOT_SIGNED_IN = "Please sign in to continue.";

function revalidateCheckout() {
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/", "layout"); // header counts
}

/* ── price-change acknowledgement (§4) ──────────────────────────── */

/**
 * The explicit customer acknowledgement of a price change: re-snapshot ONE
 * cart line at the product's CURRENT effective price.
 *
 * `acknowledged` is the price the checkout page DISPLAYED next to the
 * accept button — a consent witness, not a price source. Inside the lock
 * the server compares it against the product's current effective price and
 * refuses when they differ (the price moved again after render, or a stale
 * tab fired hours later), so a customer can never "accept" an amount that
 * was never shown to them. The stored snapshot always comes from the
 * product record on the server; the client value is only ever compared.
 */
export async function acceptPriceChange(
  itemId: string,
  acknowledged: { amount: number; currency: string },
): Promise<CheckoutFormState> {
  const user = await getCustomerUser();
  if (!user) return { error: NOT_SIGNED_IN };
  if (typeof itemId !== "string" || !itemId) {
    return { error: "Missing item." };
  }
  if (
    typeof acknowledged !== "object" ||
    acknowledged === null ||
    !Number.isSafeInteger(acknowledged.amount) ||
    acknowledged.amount < 0 ||
    typeof acknowledged.currency !== "string"
  ) {
    return { error: "Missing acknowledged price." };
  }

  const result = await withLock(
    customerLockKey(user.id),
    async (): Promise<CheckoutFormState> => {
      const repos = getRepositories();
      const cart = await repos.carts.getByUserId(user.id);
      // Ownership: the line must exist inside THIS customer's cart.
      const item = cart?.items.find((entry) => entry.id === itemId);
      if (!cart || !item) return { error: "Item not found." };

      const product = await repos.products.getById(item.productId);
      if (!product || product.status !== "published" || !isPurchasable(product)) {
        return {
          error:
            "This piece is no longer available, so its price cannot be updated. Remove it instead.",
        };
      }

      // Consent check: the price being accepted must be exactly the price
      // that is in force right now. Checked INSIDE the lock, so nothing can
      // slip between the comparison and the write.
      const current = effectivePriceOf(product);
      if (
        current.amount !== acknowledged.amount ||
        current.currency !== acknowledged.currency
      ) {
        return {
          error:
            "The price has changed again since this page loaded. Review the new price before accepting.",
        };
      }

      const now = new Date().toISOString();
      await repos.carts.update({
        ...cart,
        items: cart.items.map((entry) =>
          entry.id === item.id
            ? { ...entry, unitPrice: current, updatedAt: now }
            : entry,
        ),
        updatedAt: now,
      });
      return { success: "Price updated to the current price." };
    },
  );

  revalidateCheckout(); // refresh even on refusal — show the newest price
  return result;
}

/* ── add address from checkout (§8) ─────────────────────────────── */

/**
 * Thin wrapper around the ONE address implementation (account actions →
 * shared schema → repositories). The only addition is refreshing the
 * checkout route so the new address appears in the selector.
 */
export async function saveAddressFromCheckout(
  prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const result = await saveAddress(prev, formData);
  if (result.success) revalidatePath("/checkout");
  return result;
}

/* ── final confirmation (§15/§21 — creates NOTHING) ─────────────── */

/**
 * Re-run EVERY check server-side and, only if the whole checkout is ready,
 * hand off to the review-complete screen. Deliberately creates no record:
 * Phase 6B replaces the redirect with the real order transaction. Any
 * price/subtotal/product fields a tampered form submits are simply never
 * read.
 */
export async function confirmCheckout(
  _prev: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/checkout");

  const addressId = formData.get("addressId");
  if (typeof addressId !== "string" || !addressId) {
    return { error: "Choose a delivery address to continue." };
  }

  // Ownership + validity first — a foreign id fails before anything else.
  const address = await validateCheckoutAddress(user.id, addressId);
  if (!address.ok) {
    return {
      error: "That address is not available. Choose one of your saved addresses.",
    };
  }

  // Full authoritative re-validation: cart contents, availability,
  // publication, quantities and price snapshots as they exist RIGHT NOW.
  const view = await getCheckoutView(user, addressId);
  if (view.readiness !== "ready") {
    const first = view.issues[0]?.message;
    return {
      error:
        first ??
        "Your bag changed while you were checking out. Review it and try again.",
    };
  }

  redirect(`/checkout/complete?address=${encodeURIComponent(addressId)}`);
}
