import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth/constants";

/**
 * Phase 1 session foundation: a stateless, HMAC-signed cookie of the form
 * `<payload>.<signature>` where payload is base64url JSON.
 *
 * Later phases can swap this for database-backed sessions or an auth
 * library without changing callers — keep using `getAdminSession()`.
 */

const sessionSchema = z.object({
  /** Placeholder subject until real admin accounts exist. */
  sub: z.literal("dev-admin"),
  role: z.literal("owner"),
  issuedAt: z.number(),
  expiresAt: z.number(),
});

export type AdminSession = z.infer<typeof sessionSchema>;

function getSecret(): string | null {
  return env.SESSION_SECRET ?? null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const now = Date.now();
  const session: AdminSession = {
    sub: "dev-admin",
    role: "owner",
    issuedAt: now,
    expiresAt: now + ADMIN_SESSION_MAX_AGE * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string): AdminSession | null {
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = sessionSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    if (parsed.data.expiresAt < Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Read and verify the admin session from cookies (server-side truth). */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
