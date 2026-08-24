"use server";

import { createHash, randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_MAX_AGE,
  createCustomerSessionToken,
  getCustomerUser,
} from "@/lib/auth/customer-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/customer";
import { getRepositories } from "@/server/data";
import { getEmailProvider } from "@/server/email";
import { withLock } from "@/server/lock";
import type { AuthCredential, CustomerProfile, User } from "@/types/domain";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Echo of non-sensitive submitted values so errors don't clear the form. */
  values?: Record<string, string>;
}

function echoValues(formData: FormData, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/* ── helpers ────────────────────────────────────────────────────── */

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Only allow same-origin internal paths (no open redirects). Resolves the
 * candidate against a placeholder origin and requires it to stay there —
 * this rejects protocol-relative (`//host`), backslash (`/\host`, which
 * browsers normalize to `//host`), and absolute-URL targets alike.
 */
function safeInternalPath(path: unknown, fallback: string): string {
  if (typeof path !== "string" || !path.startsWith("/")) return fallback;
  try {
    const base = "http://placeholder.invalid";
    const resolved = new URL(path, base);
    if (resolved.origin !== base) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}

async function setCustomerCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  });
}

/**
 * Per-email brute-force damper (per process). Keyed by the submitted email
 * so one attacker spraying bogus emails can never lock out other customers
 * (the earlier global counter did). A real per-account + per-IP limiter
 * arrives with production infra.
 */
const MAX_FAILURES = 8;
const LOCKOUT_MS = 60_000;
const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();

function throttleFor(email: string) {
  const now = Date.now();
  // Opportunistic cleanup so the map can't grow unbounded.
  if (loginAttempts.size > 5000) {
    for (const [key, entry] of loginAttempts) {
      if (entry.lockedUntil < now && entry.failures === 0)
        loginAttempts.delete(key);
    }
  }
  return loginAttempts.get(email) ?? { failures: 0, lockedUntil: 0 };
}

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

/**
 * A fixed, valid scrypt hash of a random value. Verifying against it on the
 * user-not-found / inactive paths makes every failed login pay the same
 * scrypt cost, closing the timing oracle that would otherwise reveal which
 * emails are registered.
 */
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(24).toString("hex"));

/* ── sign up ────────────────────────────────────────────────────── */

export async function signupCustomer(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!env.SESSION_SECRET) {
    return { error: "Accounts are not configured on this server yet." };
  }

  const echoed = echoValues(formData, ["name", "email", "phone"]);
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues), values: echoed };
  }

  // Lock by email so two concurrent signups can't both pass the duplicate
  // check and create two accounts for the same address.
  const created = await withLock(
    `signup:${parsed.data.email}`,
    async (): Promise<
      { error: AuthFormState } | { userId: string; sessionVersion: number }
    > => {
      const repos = getRepositories();
      const existing = await repos.users.findByEmail(parsed.data.email);
      if (existing) {
        return {
          error: {
            fieldErrors: {
              email:
                "This email is already registered — try signing in instead.",
            },
            values: echoed,
          },
        };
      }

      const now = new Date().toISOString();
      const user: User = {
        id: randomUUID(),
        kind: "customer",
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const credential: AuthCredential = {
        id: randomUUID(),
        userId: user.id,
        passwordHash: hashPassword(parsed.data.password),
        sessionVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      const profile: CustomerProfile = {
        id: randomUUID(),
        userId: user.id,
        addresses: [],
        acceptsMarketing: false,
        createdAt: now,
        updatedAt: now,
      };

      await repos.users.create(user);
      await repos.credentials.create(credential);
      await repos.customers.create(profile);

      return { userId: user.id, sessionVersion: credential.sessionVersion };
    },
  );

  if ("error" in created) return created.error;

  const token = createCustomerSessionToken(
    created.userId,
    created.sessionVersion,
  );
  if (!token) return { error: "Could not create a session. Try again." };
  await setCustomerCookie(token);

  redirect("/account");
}

/* ── login ──────────────────────────────────────────────────────── */

export async function loginCustomer(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const echoed = echoValues(formData, ["email"]);
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues), values: echoed };
  }

  const email = parsed.data.email;
  const throttle = throttleFor(email);
  if (Date.now() < throttle.lockedUntil) {
    return {
      error: "Too many attempts. Please wait a minute and try again.",
      values: echoed,
    };
  }

  const repos = getRepositories();
  const user = await repos.users.findByEmail(email);
  const credential = user
    ? await repos.credentials.getByUserId(user.id)
    : null;

  // Always run exactly one scrypt verify — against the real hash when we
  // have one, else a dummy — so response time never reveals whether the
  // email exists or the account is active. One generic error covers all.
  const usable = Boolean(
    user && user.kind === "customer" && user.isActive && credential,
  );
  const valid =
    verifyPassword(
      parsed.data.password,
      usable ? credential!.passwordHash : DUMMY_PASSWORD_HASH,
    ) && usable;

  if (!valid) {
    const next = throttle.failures + 1;
    loginAttempts.set(email, {
      failures: next >= MAX_FAILURES ? 0 : next,
      lockedUntil: next >= MAX_FAILURES ? Date.now() + LOCKOUT_MS : 0,
    });
    return { error: GENERIC_LOGIN_ERROR, values: echoed };
  }

  loginAttempts.delete(email);

  const token = createCustomerSessionToken(
    user!.id,
    credential!.sessionVersion,
  );
  if (!token) return { error: "Could not create a session. Try again." };
  await setCustomerCookie(token);

  redirect(safeInternalPath(formData.get("from"), "/account"));
}

/* ── logout ─────────────────────────────────────────────────────── */

export async function logoutCustomer(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);
  redirect("/");
}

/* ── forgot password ────────────────────────────────────────────── */

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const GENERIC_FORGOT_SUCCESS =
  "If an account exists for that email, a reset link has been sent.";

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const repos = getRepositories();
  const user = await repos.users.findByEmail(parsed.data.email);

  // Identical response either way — no account enumeration.
  if (user && user.kind === "customer" && user.isActive && user.email) {
    const rawToken = randomBytes(32).toString("base64url");
    await repos.passwordResetTokens.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
      createdAt: new Date().toISOString(),
    });

    const resetUrl = `${env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${rawToken}`;
    await getEmailProvider().send({
      to: user.email,
      subject: "Reset your Libaas Couture Studio password",
      text: [
        `Hello ${user.name},`,
        "",
        "Someone requested a password reset for your account.",
        `Reset link (valid for 30 minutes, single use): ${resetUrl}`,
        "",
        "If this wasn't you, you can safely ignore this email.",
      ].join("\n"),
    });
  }

  return { success: GENERIC_FORGOT_SUCCESS };
}

/* ── reset password ─────────────────────────────────────────────── */

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const tokenHash = createHash("sha256")
    .update(parsed.data.token)
    .digest("hex");

  // Lock by token hash so the find→burn→rotate sequence is atomic: a
  // concurrent double-submit can't use the same single-use token twice.
  const result = await withLock(
    `reset:${tokenHash}`,
    async (): Promise<AuthFormState | null> => {
      const repos = getRepositories();
      const resetToken =
        await repos.passwordResetTokens.findValidByHash(tokenHash);
      if (!resetToken) {
        return {
          error:
            "This reset link is invalid or has expired. Request a new one from the forgot-password page.",
        };
      }

      const credential = await repos.credentials.getByUserId(
        resetToken.userId,
      );
      if (!credential) {
        return { error: "This reset link is no longer valid." };
      }

      // Single use: burn the token first, then rotate the credential.
      await repos.passwordResetTokens.markUsed(resetToken.id);
      await repos.credentials.update({
        ...credential,
        passwordHash: hashPassword(parsed.data.password),
        sessionVersion: credential.sessionVersion + 1, // invalidate old sessions
        updatedAt: new Date().toISOString(),
      });
      return null; // success
    },
  );
  if (result) return result;

  return {
    success: "Your password has been reset. You can now sign in.",
  };
}

/* ── change password (signed-in) ────────────────────────────────── */

export async function changePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCustomerUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const repos = getRepositories();
  const credential = await repos.credentials.getByUserId(user.id);
  if (
    !credential ||
    !verifyPassword(parsed.data.currentPassword, credential.passwordHash)
  ) {
    return { fieldErrors: { currentPassword: "Current password is incorrect." } };
  }

  const updated = await repos.credentials.update({
    ...credential,
    passwordHash: hashPassword(parsed.data.newPassword),
    sessionVersion: credential.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  });

  // Re-mint this session so the current device stays signed in.
  const token = createCustomerSessionToken(user.id, updated.sessionVersion);
  if (token) await setCustomerCookie(token);

  return { success: "Password updated. Other signed-in devices were signed out." };
}

/* ── deactivate account (danger zone) ───────────────────────────── */

export async function deactivateAccount(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCustomerUser();
  if (!user) redirect("/login");

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { fieldErrors: { password: "Enter your password to confirm." } };
  }

  const repos = getRepositories();
  const credential = await repos.credentials.getByUserId(user.id);
  if (!credential || !verifyPassword(password, credential.passwordHash)) {
    return { fieldErrors: { password: "Password is incorrect." } };
  }

  // Soft deactivation — records are preserved for future business needs
  // (orders, alterations); sessions are invalidated via the version bump.
  await repos.users.update({
    ...user,
    isActive: false,
    updatedAt: new Date().toISOString(),
  });
  await repos.credentials.update({
    ...credential,
    sessionVersion: credential.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  });

  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);
  redirect("/");
}
