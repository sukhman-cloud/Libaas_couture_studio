import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_MAX_AGE,
} from "@/lib/auth/constants";
import {
  createSignedToken,
  verifySignedToken,
} from "@/lib/auth/signed-token";
import { getRepositories } from "@/server/data";
import type { User } from "@/types/domain";

export { CUSTOMER_SESSION_COOKIE, CUSTOMER_SESSION_MAX_AGE };

const customerSessionSchema = z.object({
  kind: z.literal("customer"),
  /** The authenticated user's id — the only trusted identity source. */
  sub: z.string().min(1),
  /** Session version minted with; must match the stored credential. */
  ver: z.number().int(),
  issuedAt: z.number(),
  expiresAt: z.number(),
});

export type CustomerSessionPayload = z.infer<typeof customerSessionSchema>;

export function createCustomerSessionToken(
  userId: string,
  sessionVersion: number,
): string | null {
  const now = Date.now();
  return createSignedToken({
    kind: "customer",
    sub: userId,
    ver: sessionVersion,
    issuedAt: now,
    expiresAt: now + CUSTOMER_SESSION_MAX_AGE * 1000,
  } satisfies CustomerSessionPayload);
}

/**
 * Full server-side session check: valid signature, unexpired, user still
 * active, and the session version matches the credential (so password
 * changes / deactivation invalidate old sessions). Returns the User —
 * callers use `user.id` as the ONLY identity for ownership checks.
 */
export async function getCustomerUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySignedToken(token, customerSessionSchema);
  if (!payload) return null;
  if (payload.expiresAt < Date.now()) return null;

  const repos = getRepositories();
  const user = await repos.users.getById(payload.sub);
  if (!user || user.kind !== "customer" || !user.isActive) return null;

  const credential = await repos.credentials.getByUserId(user.id);
  if (!credential || credential.sessionVersion !== payload.ver) return null;

  return user;
}
