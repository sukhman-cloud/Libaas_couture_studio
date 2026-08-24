import "server-only";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/roles";
import { getAdminSession, type AdminSession } from "@/lib/auth/session";
import type { Permission } from "@/types/domain";

/**
 * Server-side admin authorization. Every admin mutation must call
 * `authorizeAdmin` (or `requireAdminSession` for pages) — hiding UI
 * controls is never the protection.
 */

export type AdminAuthResult =
  | { ok: true; session: AdminSession }
  | { ok: false; error: string };

export async function authorizeAdmin(
  permission?: Permission,
): Promise<AdminAuthResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "You must be signed in as an admin." };
  }
  if (permission && !hasPermission(session.role, permission)) {
    return {
      ok: false,
      error: "Your role does not allow this action.",
    };
  }
  return { ok: true, session };
}

/** Page-level guard: redirects instead of returning an error state. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
