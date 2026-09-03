"use server";

import { revalidatePath } from "next/cache";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { createCustomizationRequest } from "@/server/customization/service";
import { cancelOwnCustomizationRequest } from "@/server/customization/customer";

export type CustomizationActionState = { error?: string; success?: string };

export async function createCustomizationAction(
  _previous: CustomizationActionState,
  formData: FormData,
): Promise<CustomizationActionState> {
  const user = await getCustomerUser();
  if (!user) return { error: "Please sign in to send a request." };
  const result = await createCustomizationRequest({
    user,
    details: String(formData.get("details") ?? ""),
    productSlug: String(formData.get("productSlug") ?? "") || undefined,
    orderNumber: String(formData.get("orderNumber") ?? "") || undefined,
    orderItemId: String(formData.get("orderItemId") ?? "") || undefined,
    measurementProfileId: String(formData.get("measurementProfileId") ?? "") || undefined,
  });
  if (!result.ok) return { error: result.message };
  revalidatePath("/account/customizations");
  return { success: "Your customization request has been sent." };
}

export async function cancelCustomizationAction(
  _previous: CustomizationActionState,
  formData: FormData,
): Promise<CustomizationActionState> {
  const user = await getCustomerUser();
  const id = String(formData.get("requestId") ?? "");
  if (!user) return { error: "Please sign in again." };
  const result = await cancelOwnCustomizationRequest(user.id, id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/account/customizations");
  revalidatePath(`/account/customizations/${id}`);
  return { success: "Request cancelled." };
}
