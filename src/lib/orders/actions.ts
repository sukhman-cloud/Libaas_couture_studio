"use server";

import { revalidatePath } from "next/cache";
import {
  addAdminOrderNote,
  transitionAdminOrder,
  type AdminOrderMutationResult,
} from "@/server/orders/admin";

export type OrderActionState = AdminOrderMutationResult & { message?: string };

const initial: OrderActionState = { ok: true };

export async function changeOrderStatusAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  const nextStatus = formData.get("nextStatus");
  if (typeof orderNumber !== "string" || typeof nextStatus !== "string") {
    return { ok: false, error: "Invalid order action." };
  }
  const result = await transitionAdminOrder(orderNumber, nextStatus);
  if (result.ok) {
    revalidatePath(`/admin/orders/${orderNumber}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/account/orders/${orderNumber}`);
    revalidatePath("/account/orders");
    return { ...result, message: "Order status updated." };
  }
  return result;
}

export async function addOrderNoteAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  const body = formData.get("body");
  if (typeof orderNumber !== "string" || typeof body !== "string") {
    return { ok: false, error: "Invalid note." };
  }
  const result = await addAdminOrderNote(orderNumber, body);
  if (result.ok) {
    revalidatePath(`/admin/orders/${orderNumber}`);
    return { ...result, message: "Note added." };
  }
  return result;
}

export { initial as initialOrderActionState };
