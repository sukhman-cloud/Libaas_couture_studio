"use server";

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth/constants";
import { createSessionToken } from "@/lib/auth/session";

export interface LoginFormState {
  error?: string;
}

const loginSchema = z.object({
  password: z.string().min(1, "Password is required."),
});

/**
 * Constant-time comparison over fixed-length digests, so neither content
 * nor length of the secret leaks through timing.
 */
function safeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Minimal brute-force damper for the dev password gate (per server
 * process). Real per-account rate limiting arrives with real auth.
 */
const loginThrottle = { failures: 0, lockedUntil: 0 };
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

/**
 * Phase 1 dev-only admin login: a single password from the environment.
 * Replaced by real admin accounts + roles in a later phase.
 */
export async function loginAdmin(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  if (Date.now() < loginThrottle.lockedUntil) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (!env.ADMIN_DEV_PASSWORD || !env.SESSION_SECRET) {
    return {
      error:
        env.NODE_ENV === "production"
          ? "Admin login is not configured."
          : "Admin login is not configured. Set ADMIN_DEV_PASSWORD and SESSION_SECRET in .env.local.",
    };
  }

  if (!safeEquals(parsed.data.password, env.ADMIN_DEV_PASSWORD)) {
    loginThrottle.failures += 1;
    if (loginThrottle.failures >= MAX_FAILURES) {
      loginThrottle.failures = 0;
      loginThrottle.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    return { error: "Incorrect password." };
  }

  loginThrottle.failures = 0;
  loginThrottle.lockedUntil = 0;

  const token = createSessionToken();
  if (!token) {
    return { error: "Could not create a session. Check SESSION_SECRET." };
  }

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}
