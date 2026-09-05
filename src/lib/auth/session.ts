import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth/constants";
import { createSignedToken, verifySignedToken } from "@/lib/auth/signed-token";
import { getRepositories } from "@/server/data";
import type { RoleName } from "@/types/domain";

/**
 * Phase 14: real admin accounts. The session cookie carries only an
 * opaque, signed pointer (the admin User id); the role it reports is
 * ALWAYS re-derived server-side from the current AdminUser + Role rows on
 * every read — never trusted from the token payload itself, so a role
 * change or account removal takes effect on the very next request rather
 * than waiting for the token to expire.
 *
 * This mirrors src/lib/auth/customer-session.ts exactly (same signed-token
 * helper, same sessionVersion re-check so a password change or
 * deactivation invalidates every previously issued session).
 */

const sessionTokenSchema = z.object({
  kind: z.literal("admin"),
  /** The admin User's id — the only trusted identity in the token. */
  sub: z.string().min(1),
  /** Session version minted with; must match the stored credential. */
  ver: z.number().int(),
  issuedAt: z.number(),
  expiresAt: z.number(),
});

/** The verified, current session — role is fresh from the database, never
 *  from the token, so it can never be stale or forged. */
export interface AdminSession {
  sub: string;
  role: RoleName;
  issuedAt: number;
  expiresAt: number;
}

export function createSessionToken(
  userId: string,
  sessionVersion: number,
): string | null {
  const now = Date.now();
  return createSignedToken({
    kind: "admin",
    sub: userId,
    ver: sessionVersion,
    issuedAt: now,
    expiresAt: now + ADMIN_SESSION_MAX_AGE * 1000,
  } satisfies z.infer<typeof sessionTokenSchema>);
}

/**
 * Full server-side session check: valid signature, unexpired, the user is
 * still an active admin, the session version matches the stored
 * credential (password change / deactivation invalidates old sessions),
 * and — the admin-specific step — an AdminUser row and its Role still
 * exist. Losing the AdminUser row (revoked access) invalidates the
 * session immediately, without waiting for the token to expire.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySignedToken(token, sessionTokenSchema);
  if (!payload) return null;
  if (payload.expiresAt < Date.now()) return null;

  const repos = getRepositories();
  const user = await repos.users.getById(payload.sub);
  if (!user || user.kind !== "admin" || !user.isActive) return null;

  const credential = await repos.credentials.getByUserId(user.id);
  if (!credential || credential.sessionVersion !== payload.ver) return null;

  const adminUser = await repos.adminUsers.getByUserId(user.id);
  if (!adminUser) return null;

  const role = await repos.roles.getById(adminUser.roleId);
  if (!role) return null;

  return {
    sub: user.id,
    role: role.name,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}
