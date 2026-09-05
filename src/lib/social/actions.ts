"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdmin } from "@/lib/auth/admin-guard";
import { refreshInstagramFeed } from "@/server/instagram/service";

export interface InstagramRefreshState {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * Admin-triggered "Refresh now" — bypasses the passive failure back-off so
 * an operator can retry immediately after fixing a token, without waiting
 * out the 60-second window every customer-facing page load respects.
 */
export async function refreshInstagramAction(
  _previous: InstagramRefreshState,
  _formData: FormData,
): Promise<InstagramRefreshState> {
  const auth = await authorizeAdmin("content.manage");
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await refreshInstagramFeed();
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/content");
  revalidatePath("/");
  return {
    ok: true,
    message: `Refreshed — ${result.postCount} post${result.postCount === 1 ? "" : "s"} cached.`,
  };
}
