import "server-only";
import { addressSchema } from "@/lib/validation/customer";
import { getRepositories } from "@/server/data";
import {
  getCartView,
  type CartLine,
} from "@/server/commerce/service";
import type { CustomerAddress, Money, User } from "@/types/domain";

/**
 * Checkout foundation (Phase 6A) — the single server-side seam that
 * assembles and validates everything an order will eventually need.
 *
 * WHAT THIS IS
 * - The ONLY place checkout readiness is decided. The page renders it, the
 *   confirm action re-runs it; the browser never gets a vote.
 * - A read-only composition over the EXISTING repositories and the
 *   Phase 5A cart service — the same purchasability, price-snapshot and
 *   integer-paise rules, not a second implementation.
 * - Deliberately order-free: Phase 6B adds the Order model and its
 *   creation transaction on top of this exact view.
 *
 * WHAT THE CLIENT RECEIVES
 * A view model (`CheckoutView`) containing only what the UI renders:
 * no password hashes, no storage keys, no internal product ids (public
 * slugs + the customer's own cart-line/address ids only), no admin data.
 *
 * TRUST BOUNDARY
 * Everything the browser sends about checkout — product ids, prices,
 * subtotals, quantities, availability — is ignored. The only inputs taken
 * from the request are the session cookie and a candidate address id, and
 * the address id is only honoured after ownership + validity checks here.
 */

/* ── view model ─────────────────────────────────────────────────── */

export interface CheckoutCustomer {
  name: string;
  /** Account email — checkout displays it and can never change it. */
  email?: string;
  phone?: string;
}

export interface CheckoutAddress {
  id: string;
  label: "home" | "work" | "other";
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  locality?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CheckoutItem {
  /** The customer's own cart-line id (already used by the bag page). */
  itemId: string;
  /** Public catalog identity — absent when the product is unavailable. */
  slug?: string;
  name?: string;
  image?: { mediaId: string; alt: string };
  quantity: number;
  /** Snapshot price the line will be charged at — integer paise. */
  unitPrice: Money;
  lineTotal: Money;
  unavailable: boolean;
  priceChanged: boolean;
  /** Live price, shown when it differs from the snapshot. */
  currentPrice?: Money;
  /**
   * Phase-7 reserved cart fields (configurationKey / stitching /
   * customization / notes) are present on this line. Checkout surfaces a
   * neutral indicator and never touches the fields themselves.
   */
  hasConfiguration: boolean;
}

/** One thing blocking checkout, with a stable code the UI can key on. */
export interface CheckoutIssue {
  code:
    | "empty_cart"
    | "item_unavailable"
    | "price_changed"
    | "address_required"
    | "address_invalid";
  message: string;
  /** The cart line this issue belongs to, when it is line-scoped. */
  itemId?: string;
}

export type CheckoutReadiness =
  | "empty_cart"
  | "cart_invalid"
  | "price_changed"
  | "address_required"
  | "ready";

export interface CheckoutView {
  customer: CheckoutCustomer;
  addresses: CheckoutAddress[];
  /** Validated, owned selection — null until one passes every check. */
  selectedAddress: CheckoutAddress | null;
  /**
   * True when the request carried an address id that did NOT survive
   * validation (foreign, unknown or invalid) — the UI says so instead of
   * silently falling back.
   */
  rejectedAddressSelection: boolean;
  items: CheckoutItem[];
  /** Merchandise subtotal — purchasable lines only, integer paise. */
  subtotal: Money;
  itemCount: number;
  totalQuantity: number;
  unavailableCount: number;
  priceChangedCount: number;
  issues: CheckoutIssue[];
  readiness: CheckoutReadiness;
  /**
   * Honest delivery statement (§9): no rates, dates or taxes are known to
   * the application yet, so none are shown. Room is left here for the
   * future shipping/tax/discount/payment fields.
   */
  deliveryNote: string;
}

export const DELIVERY_NOTE =
  "Shipping charges will be confirmed by the studio.";

/* ── address validation (§7) ────────────────────────────────────── */

export type AddressValidation =
  | { ok: true; address: CustomerAddress; isDefault: boolean }
  | { ok: false; reason: "not_found" | "invalid" };

/**
 * Validate a candidate address id for THIS user: it must exist inside the
 * customer's own profile (ownership — a foreign or deleted id fails
 * identically as `not_found`, revealing nothing), and its stored fields
 * must still satisfy the SAME schema the address form enforces (PIN,
 * phone, required fields) — the one implementation, reused.
 */
export async function validateCheckoutAddress(
  userId: string,
  addressId: string,
  // Injectable so the order-creation transaction (Phase 6C) can run the
  // SAME validation against its transaction-scoped repositories — one
  // implementation, checked twice: at render/confirm and inside the tx.
  repos: Pick<
    import("@/server/data/repositories").StoreRepositories,
    "customers"
  > = getRepositories(),
): Promise<AddressValidation> {
  if (typeof addressId !== "string" || !addressId) {
    return { ok: false, reason: "not_found" };
  }
  const profile = await repos.customers.getByUserId(userId);
  const address = profile?.addresses.find((a) => a.id === addressId);
  if (!profile || !address) return { ok: false, reason: "not_found" };

  // zod object schemas ignore unknown keys, so the stored row (id included)
  // is checked directly against the same rules the address form enforces.
  if (!addressSchema.safeParse(address).success) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, address, isDefault: profile.defaultAddressId === address.id };
}

/* ── the view ───────────────────────────────────────────────────── */

function toCheckoutAddress(
  address: CustomerAddress,
  defaultAddressId: string | undefined,
): CheckoutAddress {
  return {
    id: address.id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    locality: address.locality,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.id === defaultAddressId,
  };
}

function toCheckoutItem(
  line: CartLine,
  hasConfiguration: boolean,
): CheckoutItem {
  return {
    itemId: line.itemId,
    slug: line.product?.slug,
    name: line.product?.name,
    image: line.product?.image,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    unavailable: line.unavailable,
    priceChanged: line.priceChanged,
    currentPrice: line.priceChanged ? line.product?.currentPrice : undefined,
    hasConfiguration,
  };
}

/**
 * Build the authoritative checkout view for the signed-in user.
 *
 * `requestedAddressId` is the untrusted candidate from the URL/form; it is
 * honoured only after `validateCheckoutAddress`. With no candidate, the
 * customer's default address (or their only address) is preselected.
 */
export async function getCheckoutView(
  user: User,
  requestedAddressId?: string,
): Promise<CheckoutView> {
  const repos = getRepositories();

  // One read each — the cart view resolves its own products.
  const [cartView, profile, rawCart] = await Promise.all([
    getCartView(user.id),
    repos.customers.getByUserId(user.id),
    repos.carts.getByUserId(user.id),
  ]);

  // Phase-7 reserved fields ride along untouched; checkout only signals
  // their presence (§13).
  const configuredIds = new Set(
    (rawCart?.items ?? [])
      .filter(
        (item) =>
          item.configurationKey !== "" ||
          item.stitching !== undefined ||
          item.customizationRequestId !== undefined ||
          (item.notes !== undefined && item.notes !== ""),
      )
      .map((item) => item.id),
  );

  const items = cartView.lines.map((line) =>
    toCheckoutItem(line, configuredIds.has(line.itemId)),
  );

  const defaultAddressId = profile?.defaultAddressId;
  const addresses = (profile?.addresses ?? []).map((address) =>
    toCheckoutAddress(address, defaultAddressId),
  );

  // Selection: explicit candidate first, else default, else an only
  // address. Every path goes through the same validation.
  let selectedAddress: CheckoutAddress | null = null;
  let rejectedAddressSelection = false;
  const candidates = requestedAddressId
    ? [requestedAddressId]
    : [defaultAddressId, addresses.length === 1 ? addresses[0].id : undefined];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const result = await validateCheckoutAddress(user.id, candidate);
    if (result.ok) {
      selectedAddress = toCheckoutAddress(result.address, defaultAddressId);
      break;
    }
    if (candidate === requestedAddressId) rejectedAddressSelection = true;
  }

  /* issues + readiness */
  const issues: CheckoutIssue[] = [];
  for (const item of items) {
    if (item.unavailable) {
      issues.push({
        code: "item_unavailable",
        itemId: item.itemId,
        message: `${item.name ?? "A piece in your bag"} is no longer available. Remove it to continue.`,
      });
    } else if (item.priceChanged) {
      issues.push({
        code: "price_changed",
        itemId: item.itemId,
        message: `The price of ${item.name ?? "a piece in your bag"} has changed. Review it to continue.`,
      });
    }
  }

  let readiness: CheckoutReadiness;
  if (items.length === 0) {
    readiness = "empty_cart";
    issues.push({ code: "empty_cart", message: "Your cart is empty." });
  } else if (items.some((item) => item.unavailable)) {
    readiness = "cart_invalid";
  } else if (items.some((item) => item.priceChanged)) {
    readiness = "price_changed";
  } else if (!selectedAddress) {
    readiness = "address_required";
    issues.push({
      code: rejectedAddressSelection ? "address_invalid" : "address_required",
      message: rejectedAddressSelection
        ? "That address is not available. Choose one of your saved addresses."
        : "Add a delivery address to continue.",
    });
  } else {
    readiness = "ready";
  }

  return {
    customer: { name: user.name, email: user.email, phone: user.phone },
    addresses,
    selectedAddress,
    rejectedAddressSelection,
    items,
    subtotal: cartView.subtotal,
    itemCount: cartView.itemCount,
    totalQuantity: cartView.totalQuantity,
    unavailableCount: cartView.unavailableCount,
    priceChangedCount: items.filter((item) => item.priceChanged).length,
    issues,
    readiness,
    deliveryNote: DELIVERY_NOTE,
  };
}
