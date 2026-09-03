"use server";

import { revalidatePath } from "next/cache";
import { addCustomizationNote, transitionCustomization } from "@/server/customization/admin";

export type CustomizationAdminActionState = { error?: string; success?: string };

export async function changeCustomizationStatusAction(_prev: CustomizationAdminActionState, formData: FormData) {
  const result = await transitionCustomization(String(formData.get("requestId") ?? ""), String(formData.get("nextStatus") ?? ""));
  if (!result.ok) return { error: result.error };
  const id = String(formData.get("requestId"));
  revalidatePath(`/admin/customizations/${id}`);
  revalidatePath("/admin/customizations");
  return { success: "Request status updated." };
}

export async function addCustomizationNoteAction(_prev: CustomizationAdminActionState, formData: FormData) {
  const id = String(formData.get("requestId") ?? "");
  const result = await addCustomizationNote(id, String(formData.get("body") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/customizations/${id}`);
  return { success: "Note added." };
}
