"use server";

import { revalidatePath } from "next/cache";
import {
  addAdminOrderNote,
  createAdminShipment,
  recordAdminManualPayment,
  transitionAdminOrder,
  transitionAdminPayment,
  transitionAdminShipment,
  updateAdminShipmentTracking,
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

export async function recordManualPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string") {
    return { ok: false, error: "Invalid order." };
  }
  const result = await recordAdminManualPayment(orderNumber);
  if (result.ok) {
    revalidatePath(`/admin/orders/${orderNumber}`);
    revalidatePath(`/account/orders/${orderNumber}`);
    revalidatePath("/admin/payments");
    return { ...result, message: "Payment recorded as paid." };
  }
  return result;
}

export async function transitionPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  const nextStatus = formData.get("nextStatus");
  if (typeof orderNumber !== "string" || typeof nextStatus !== "string") {
    return { ok: false, error: "Invalid payment action." };
  }
  const result = await transitionAdminPayment(orderNumber, nextStatus);
  if (result.ok) {
    revalidatePath(`/admin/orders/${orderNumber}`);
    revalidatePath(`/account/orders/${orderNumber}`);
    revalidatePath("/admin/payments");
    return { ...result, message: "Payment status updated." };
  }
  return result;
}

function revalidateOrder(orderNumber: string) {
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${orderNumber}`);
}

export async function createShipmentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  const method = formData.get("method");
  if (typeof orderNumber !== "string" || typeof method !== "string") {
    return { ok: false, error: "Invalid shipment request." };
  }
  const result = await createAdminShipment(orderNumber, method);
  if (result.ok) {
    revalidateOrder(orderNumber);
    return { ...result, message: "Shipment created." };
  }
  return result;
}

export async function transitionShipmentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  const nextStatus = formData.get("nextStatus");
  if (typeof orderNumber !== "string" || typeof nextStatus !== "string") {
    return { ok: false, error: "Invalid shipment action." };
  }
  const result = await transitionAdminShipment(orderNumber, nextStatus);
  if (result.ok) {
    revalidateOrder(orderNumber);
    return { ...result, message: "Shipment status updated." };
  }
  return result;
}

export async function updateShipmentTrackingAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const orderNumber = formData.get("orderNumber");
  if (typeof orderNumber !== "string") {
    return { ok: false, error: "Invalid order." };
  }
  const carrier = formData.get("carrier");
  const trackingNumber = formData.get("trackingNumber");
  const estimatedDelivery = formData.get("estimatedDelivery");
  const result = await updateAdminShipmentTracking(orderNumber, {
    ...(typeof carrier === "string" ? { carrier } : {}),
    ...(typeof trackingNumber === "string" ? { trackingNumber } : {}),
    ...(typeof estimatedDelivery === "string" ? { estimatedDelivery } : {}),
  });
  if (result.ok) {
    revalidateOrder(orderNumber);
    return { ...result, message: "Tracking information saved." };
  }
  return result;
}

export { initial as initialOrderActionState };
