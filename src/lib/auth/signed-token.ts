import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Shared stateless-token helpers: `<base64url payload>.<HMAC-SHA256 sig>`.
 * Used by both the admin and customer sessions.
 */

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedToken(payload: unknown): string | null {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySignedToken<Schema extends z.ZodTypeAny>(
  token: string,
  schema: Schema,
): z.infer<Schema> | null {
  const secret = env.SESSION_SECRET;
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
    const parsed = schema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
