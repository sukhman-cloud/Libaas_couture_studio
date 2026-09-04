"use server";

import { revalidatePath } from "next/cache";
import {
  adjustAdminStock,
  setAdminInventoryTracking,
  type InventoryActionResult,
} from "@/server/inventory/admin";
import type { InventoryMovementType } from "@/types/domain";

export type InventoryActionState = InventoryActionResult & { message?: string };

const initial: InventoryActionState = { ok: true };
export { initial as initialInventoryActionState };

const ADJUSTMENT_TYPES: InventoryMovementType[] = [
  "restock",
  "adjustment",
  "damaged",
  "correction",
  "return",
  "initial_stock",
];

function revalidateInventory(productId: string) {
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${productId}`);
}

/**
 * One shared action for every admin stock-change form (restock, remove,
 * correct, mark damaged, record a return). `idempotencyKey` is a fresh
 * per-render UUID minted by the form component (the same discipline
 * checkout's confirm form uses), so a double-click/browser-retry submits
 * the same key twice and the service layer's duplicate-key check makes
 * the second submission a safe no-op rather than a double adjustment.
 */
export async function adjustStockAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const productId = formData.get("productId");
  const type = formData.get("type");
  const quantityChangeRaw = formData.get("quantityChange");
  const reason = formData.get("reason");
  const idempotencyKey = formData.get("idempotencyKey");

  if (typeof productId !== "string" || !productId) {
    return { ok: false, error: "Invalid product." };
  }
  if (typeof type !== "string" || !ADJUSTMENT_TYPES.includes(type as InventoryMovementType)) {
    return { ok: false, error: "Choose a movement type." };
  }
  const quantityChange = Number(quantityChangeRaw);
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    return { ok: false, error: "Enter a non-zero whole-number quantity." };
  }

  const result = await adjustAdminStock({
    productId,
    type: type as InventoryMovementType,
    quantityChange,
    ...(typeof reason === "string" && reason.trim() ? { reason } : {}),
    ...(typeof idempotencyKey === "string" && idempotencyKey ? { idempotencyKey } : {}),
  });
  if (result.ok) {
    revalidateInventory(productId);
    return { ...result, message: "Stock updated." };
  }
  return result;
}

export async function setInventoryTrackingAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const productId = formData.get("productId");
  const trackingEnabled = formData.get("trackingEnabled") === "true";
  const thresholdRaw = formData.get("lowStockThreshold");

  if (typeof productId !== "string" || !productId) {
    return { ok: false, error: "Invalid product." };
  }
  const lowStockThreshold =
    typeof thresholdRaw === "string" && thresholdRaw !== "" ? Number(thresholdRaw) : undefined;
  if (lowStockThreshold !== undefined && !Number.isInteger(lowStockThreshold)) {
    return { ok: false, error: "Low-stock threshold must be a whole number." };
  }

  const result = await setAdminInventoryTracking({
    productId,
    trackingEnabled,
    ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
  });
  if (result.ok) {
    revalidateInventory(productId);
    return { ...result, message: "Tracking settings saved." };
  }
  return result;
}
