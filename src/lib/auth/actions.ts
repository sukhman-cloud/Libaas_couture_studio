"use server";

import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { authorizeAdmin } from "@/lib/auth/admin-guard";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { getRepositories } from "@/server/data";
import type { RoleName } from "@/types/domain";

export interface LoginFormState {
  error?: string;
}

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

/**
 * A fixed, valid scrypt hash of a random value — verifying against it on
 * the user-not-found path makes every failed login pay the same scrypt
 * cost, so response time never reveals which emails have admin accounts.
 * Mirrors the identical pattern in customer-actions.ts.
 */
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(24).toString("hex"));

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

/**
 * Per-email throttle, mirroring customer-actions.ts exactly. A single
 * process-wide counter (the old dev-password gate's approach) would let
 * one person's failed attempts lock out every other admin; per-email
 * throttling does not have that problem.
 */
const MAX_FAILURES = 8;
const LOCKOUT_MS = 60_000;
const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();

function throttleFor(email: string) {
  const now = Date.now();
  if (loginAttempts.size > 5000) {
    for (const [key, entry] of loginAttempts) {
      if (entry.lockedUntil < now && entry.failures === 0) loginAttempts.delete(key);
    }
  }
  return loginAttempts.get(email) ?? { failures: 0, lockedUntil: 0 };
}

/**
 * Phase 14: real per-employee admin accounts. Replaces the single shared
 * dev-password gate — every admin now authenticates as themselves, and
 * every admin action is attributable to a real User id.
 *
 * SECURITY: this function only ever verifies an EXISTING admin account.
 * There is no path here — or anywhere reachable from a public route — that
 * creates one. The first owner account is created exclusively by
 * scripts/bootstrap-admin.mjs (a one-time, server-side, env-secret-gated
 * script); every subsequent admin account is created exclusively by
 * createStaffAccount below, which itself requires an authenticated caller
 * already holding the "staff.manage" permission.
 */
export async function loginAdmin(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = parsed.data.email.toLowerCase();
  const throttle = throttleFor(email);
  if (Date.now() < throttle.lockedUntil) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const repos = getRepositories();
  const user = await repos.users.findByEmail(email);
  const credential = user ? await repos.credentials.getByUserId(user.id) : null;
  const adminUser =
    user && credential ? await repos.adminUsers.getByUserId(user.id) : null;

  // Always run exactly one scrypt verify — against the real hash when
  // everything checks out, else a dummy — so response time never reveals
  // whether the email exists, is an admin, or has been deactivated.
  const usable = Boolean(
    user && user.kind === "admin" && user.isActive && credential && adminUser,
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
    return { error: GENERIC_LOGIN_ERROR };
  }

  loginAttempts.delete(email);

  const token = createSessionToken(user!.id, credential!.sessionVersion);
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

/* ── staff provisioning (owner/authorized-admin only) ──────────────── */

export interface CreateStaffFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** Kept in sync with RoleName via the type assertion below — a mismatch
 *  here fails the build rather than silently accepting an invalid role. */
const ROLE_NAMES = ["owner", "manager", "tailor", "staff"] as const satisfies readonly RoleName[];

const createStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(ROLE_NAMES),
});

/**
 * The ONLY way a new admin account is ever created after the first owner
 * exists. SECURITY: role is a server-validated enum, never trusted from
 * anywhere else — and the caller must already hold "staff.manage" before
 * any of this runs. A customer account can never reach this function:
 * it is not exposed by any public route, form, or API, and even if
 * called directly, `authorizeAdmin` re-verifies the session server-side
 * from the database on every invocation.
 */
export async function createStaffAccount(
  _prev: CreateStaffFormState,
  formData: FormData,
): Promise<CreateStaffFormState> {
  const auth = await authorizeAdmin("staff.manage");
  if (!auth.ok) return { error: auth.error };

  const parsed = createStaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { name, email, password, role } = parsed.data;
  const repos = getRepositories();

  const roleRow = await repos.roles.getByName(role);
  if (!roleRow) {
    return { error: "That role is not configured." };
  }

  try {
    await repos.transaction(async (tx) => {
      const existing = await tx.users.findByEmail(email);
      if (existing) {
        throw new Error("An account with this email already exists.");
      }

      const now = new Date().toISOString();
      const userId = randomUUID();
      const user = await tx.users.create({
        id: userId,
        kind: "admin",
        name,
        email,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await tx.credentials.create({
        id: randomUUID(),
        userId: user.id,
        passwordHash: hashPassword(password),
        sessionVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      await tx.adminUsers.create({
        id: randomUUID(),
        userId: user.id,
        roleId: roleRow.id,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create the account.",
    };
  }

  return { success: `${name} can now sign in as ${role}.` };
}
