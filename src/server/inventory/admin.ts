import "server-only";
import { redirect } from "next/navigation";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { hasPermission } from "@/lib/auth/roles";
import {
  adjustStock,
  getAdminInventoryDetail,
  listAdminInventory,
  setInventoryTracking,
  type AdminInventoryDetail,
  type AdminInventoryList,
} from "@/server/inventory/service";
import type { InventoryMovementType } from "@/types/domain";

/**
 * Admin-authorized entry points for inventory (Phase 13) — mirrors
 * `orders/admin.ts`/`payments`/`shipping`'s split: the service layer
 * (`inventory/service.ts`) is authorization-agnostic and reusable, this
 * module is the ONLY place that checks `inventory.read`/`inventory.write`
 * before calling into it. Every mutation here re-derives the acting
 * admin's identity from the verified session — never from a form field.
 */

async function requireInventoryRead() {
  const session = await requireAdminSession();
  if (!hasPermission(session.role, "inventory.read")) redirect("/admin");
  return session;
}

export async function listAdminInventoryPage(params: {
  search?: string;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  page?: number;
}): Promise<AdminInventoryList> {
  await requireInventoryRead();
  return listAdminInventory(params);
}

export async function getAdminInventoryDetailPage(
  productId: string,
): Promise<AdminInventoryDetail | null> {
  await requireInventoryRead();
  return getAdminInventoryDetail(productId);
}

export type InventoryActionResult = { ok: true } | { ok: false; error: string };

const MAX_MANUAL_QUANTITY = 100_000;

export async function adjustAdminStock(input: {
  productId: string;
  type: InventoryMovementType;
  quantityChange: number;
  reason?: string;
  idempotencyKey?: string;
}): Promise<InventoryActionResult> {
  const auth = await authorizeAdmin("inventory.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof input.productId !== "string" || !input.productId) {
    return { ok: false, error: "Product not found." };
  }
  if (
    !Number.isInteger(input.quantityChange) ||
    Math.abs(input.quantityChange) > MAX_MANUAL_QUANTITY
  ) {
    return { ok: false, error: "Enter a reasonable whole-number quantity." };
  }

  const result = await adjustStock({
    productId: input.productId,
    type: input.type,
    quantityChange: input.quantityChange,
    ...(input.reason ? { reason: input.reason } : {}),
    actorUserId: auth.session.sub,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function setAdminInventoryTracking(input: {
  productId: string;
  trackingEnabled: boolean;
  lowStockThreshold?: number;
}): Promise<InventoryActionResult> {
  const auth = await authorizeAdmin("inventory.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof input.productId !== "string" || !input.productId) {
    return { ok: false, error: "Product not found." };
  }

  const result = await setInventoryTracking(input);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
