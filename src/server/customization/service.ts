import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import type { CustomizationRequest, User } from "@/types/domain";
import { isOrderNumber } from "@/server/orders/service";

/**
 * Customization-request foundation (Phase 7B).
 *
 * Deliberately the MINIMUM that is honest today: a customer can hold
 * draft requests that name a customization-capable product, optionally
 * one of their own measurement profiles, and their free-text details.
 *
 * NOT implemented on purpose (documented in
 * docs/phase-7b-measurement-snapshot.md):
 *   - no customer-facing creation UI and no exported server action — a
 *     stored request the studio cannot yet see would be a false
 *     promise; the entry point ships together with the designer phase
 *     and its admin view
 *   - no reference-image uploads (storage design belongs to that phase)
 *   - no cart/order attachment — `CartItem.customizationRequestId`
 *     stays unset; the validation seam for the future attach flow is
 *     `validateCustomizationAttachment` in
 *     src/server/cart/configuration.ts
 *   - status is always `draft`; the quoted/approved/rejected states are
 *     a documented roadmap, not reachable code
 *
 * TRUST BOUNDARY — the caller supplies the verified session user; the
 * product is addressed by public slug and its `customizationAvailable`
 * flag is re-checked here; a measurement profile must exist, belong to
 * the user and be unarchived (the account pages' exact rule); `details`
 * is untrusted text — trimmed, length-capped (the database CHECK
 * backstops it) and only ever rendered through React's escaping.
 */

export const CUSTOMIZATION_DETAILS_MAX = 1000;

export type CreateCustomizationResult =
  | { ok: true; request: CustomizationRequest }
  | { ok: false; message: string };

export async function createCustomizationRequest(input: {
  user: User;
  details: string;
  /** Public product slug; omit for a fully custom design. */
  productSlug?: string;
  measurementProfileId?: string;
  orderNumber?: string;
  orderItemId?: string;
}): Promise<CreateCustomizationResult> {
  const { user } = input;
  const repos = getRepositories();

  const details =
    typeof input.details === "string" ? input.details.trim() : "";
  if (!details) {
    return { ok: false, message: "Describe what you would like customised." };
  }
  if (details.length > CUSTOMIZATION_DETAILS_MAX) {
    return {
      ok: false,
      message: `Keep the description within ${CUSTOMIZATION_DETAILS_MAX} characters.`,
    };
  }

  let productId: string | undefined;
  if (input.productSlug !== undefined) {
    if (typeof input.productSlug !== "string" || !input.productSlug) {
      return { ok: false, message: "This product is not available." };
    }
    const product = await repos.products.getBySlug(input.productSlug);
    if (!product || product.status !== "published") {
      return { ok: false, message: "This product is not available." };
    }
    // Capability is the server's decision (§21) — a browser can never
    // force customization onto a product that does not offer it.
    if (!product.customizationAvailable) {
      return {
        ok: false,
        message: "This piece is not offered with customisation.",
      };
    }
    productId = product.id;
  }

  let measurementProfileId: string | undefined;
  if (input.measurementProfileId !== undefined) {
    if (
      typeof input.measurementProfileId !== "string" ||
      !input.measurementProfileId
    ) {
      return { ok: false, message: "That measurement profile is not available." };
    }
    const profile = await repos.measurementProfiles.getById(
      input.measurementProfileId,
    );
    // Ownership + liveness — missing, foreign and archived are
    // indistinguishable (the same rule as every measurement surface).
    if (!profile || profile.userId !== user.id || profile.archivedAt) {
      return { ok: false, message: "That measurement profile is not available." };
    }
    measurementProfileId = profile.id;
  }

  let orderId: string | undefined;
  let orderItemId: string | undefined;
  if (input.orderNumber !== undefined || input.orderItemId !== undefined) {
    if (
      !isOrderNumber(input.orderNumber) ||
      typeof input.orderItemId !== "string" ||
      !input.orderItemId
    ) {
      return { ok: false, message: "That order item is not available." };
    }
    const order = await repos.orders.getByOrderNumber(input.orderNumber);
    const item = order?.items.find((candidate) => candidate.id === input.orderItemId);
    if (!order || order.userId !== user.id || !item) {
      return { ok: false, message: "That order item is not available." };
    }
    orderId = order.id;
    orderItemId = item.id;
  }

  const now = new Date().toISOString();
  const request = await repos.transaction(async (tx) => {
    const created = await tx.customizationRequests.create({
      id: randomUUID(),
      userId: user.id,
      ...(productId === undefined ? {} : { productId }),
      ...(measurementProfileId === undefined ? {} : { measurementProfileId }),
      ...(orderId === undefined ? {} : { orderId }),
      ...(orderItemId === undefined ? {} : { orderItemId }),
      details,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await tx.customizationActivities.create({
      id: randomUUID(),
      customizationRequestId: created.id,
      type: "request_created",
      createdAt: now,
    });
    return created;
  });
  return { ok: true, request };
}

/** The signed-in customer's own requests, newest first. */
export async function listOwnCustomizationRequests(
  userId: string,
): Promise<CustomizationRequest[]> {
  return getRepositories().customizationRequests.listByUserId(userId);
}
