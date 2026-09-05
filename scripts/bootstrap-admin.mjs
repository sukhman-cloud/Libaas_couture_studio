#!/usr/bin/env node
/**
 * Create the FIRST owner admin account (Phase 14).
 *
 *   ADMIN_BOOTSTRAP_SECRET=... node scripts/bootstrap-admin.mjs \
 *     --name "Studio Owner" --email owner@example.com --password "..."
 *
 * This is the ONLY way the first admin account is ever created. There is
 * no public /admin/signup route and never will be — every admin account
 * after this one is created by an authenticated owner from /admin/staff
 * (src/lib/auth/actions.ts's createStaffAccount, itself gated on the
 * "staff.manage" permission).
 *
 * SAFETY CONTRACT
 * 1. Refuses to run unless ADMIN_BOOTSTRAP_SECRET is set in the
 *    environment (not read from .env.local by convention — this is a
 *    deliberate one-time act, not a config value to leave lying around).
 * 2. Refuses to run if ANY admin account already exists. This makes the
 *    script safe to keep in the repo forever: running it a second time on
 *    a live system is a no-op, never a way to mint a rogue extra owner.
 * 3. Works against whichever DATA_PROVIDER the environment specifies
 *    (file/memory/postgres) — same as the rest of the app — but for
 *    "memory" there is nothing durable to bootstrap into (the process
 *    that would use the account is a different one), so that case is
 *    rejected with an explanation instead of silently doing nothing.
 * 4. Deliberately does NOT import application code (see scripts/lib's own
 *    convention) — it re-implements the exact scrypt format from
 *    src/lib/auth/password.ts and the exact JSON shape from
 *    src/server/data/store-provider.ts, so a bug in the app can never
 *    silently corrupt the one account meant to fix things.
 * 5. Never prints the password. Prints only the created account's name,
 *    email and role.
 */

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`\n  ABORTED  ${message}\n`);
  process.exit(1);
}

/* ── args ───────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`--${key} requires a value.`);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!process.env.ADMIN_BOOTSTRAP_SECRET || process.env.ADMIN_BOOTSTRAP_SECRET.length < 16) {
  fail(
    "ADMIN_BOOTSTRAP_SECRET must be set (16+ characters) in the environment to run this script. " +
      "This is deliberate: there is no other way to create the first admin account.",
  );
}

const name = (args.name ?? "").trim();
const email = (args.email ?? "").trim().toLowerCase();
const password = args.password ?? "";

if (!name) fail("--name is required.");
if (!email || !email.includes("@")) fail("--email must be a valid email address.");
if (password.length < 8) fail("--password must be at least 8 characters.");

/* ── password hashing — mirrors src/lib/auth/password.ts exactly ──── */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function hashPassword(raw) {
  const salt = randomBytes(16);
  const hash = scryptSync(raw.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

const dataProvider = process.env.DATA_PROVIDER || "file";

if (dataProvider === "memory") {
  fail(
    'DATA_PROVIDER=memory has nothing durable to bootstrap into — the running server process ' +
      "holds its own in-memory store that this script cannot reach. Use \"file\" for local " +
      'development or "postgres" for a real deployment.',
  );
}

/* ── postgres path ──────────────────────────────────────────────── */

async function bootstrapPostgres() {
  if (!process.env.DATABASE_URL) {
    fail("DATA_PROVIDER=postgres requires DATABASE_URL to be set.");
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const existingAdminCount = await prisma.adminUser.count();
    if (existingAdminCount > 0) {
      fail(
        `${existingAdminCount} admin account(s) already exist — this script only creates the FIRST one. ` +
          "Use an authenticated owner's /admin/staff page to add more.",
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      fail(`A user with email ${email} already exists (kind: ${existingUser.kind}).`);
    }

    const ownerRole = await prisma.role.findUnique({ where: { name: "owner" } });
    if (!ownerRole) {
      fail(
        'No "owner" role row found — has the admin-accounts migration ' +
          "(prisma/migrations/*_admin_accounts_phase_14) been applied to this database?",
      );
    }

    const now = new Date();
    const userId = randomUUID();
    await prisma.$transaction([
      prisma.user.create({
        data: { id: userId, kind: "admin", name, email, isActive: true, createdAt: now, updatedAt: now },
      }),
      prisma.authCredential.create({
        data: {
          id: randomUUID(),
          userId,
          passwordHash: hashPassword(password),
          sessionVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.adminUser.create({
        data: { id: randomUUID(), userId, roleId: ownerRole.id, createdAt: now, updatedAt: now },
      }),
    ]);

    console.log(`\n  CREATED  ${name} <${email}> as owner.\n`);
    console.log("  Sign in at /admin/login. This script will now refuse to run again.\n");
  } finally {
    await prisma.$disconnect();
  }
}

/* ── file-store path ────────────────────────────────────────────── */

function fileStorePath() {
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || ".data");
  return path.join(dataDir, "dev-store.json");
}

/**
 * Matches STORE_VERSION and seedRoles() in src/server/data/store-provider.ts
 * exactly — kept here, not imported, per this directory's own convention
 * (scripts/lib/db-to-store.mjs) of never depending on the application code
 * a script might need to recover from. If that file's STORE_VERSION or role
 * ids/permissions ever change, update both together.
 */
const CURRENT_STORE_VERSION = 11;
const SEEDED_ROLES = [
  {
    id: "role-owner",
    name: "owner",
    permissions: [
      "orders.read", "orders.write", "products.read", "products.write",
      "inventory.read", "inventory.write", "customers.read", "customers.write",
      "appointments.read", "appointments.write", "payments.read", "payments.write",
      "shipping.read", "shipping.write", "staff.manage", "settings.manage",
      "content.manage", "analytics.read", "audit.read",
    ],
  },
  {
    id: "role-manager",
    name: "manager",
    permissions: [
      "orders.read", "orders.write", "products.read", "products.write",
      "inventory.read", "inventory.write", "customers.read", "customers.write",
      "appointments.read", "appointments.write", "payments.read",
      "shipping.read", "shipping.write", "analytics.read",
    ],
  },
  {
    id: "role-tailor",
    name: "tailor",
    permissions: ["orders.read", "appointments.read", "inventory.read"],
  },
  {
    id: "role-staff",
    name: "staff",
    permissions: ["orders.read", "customers.read", "appointments.read", "appointments.write"],
  },
];

async function bootstrapFileStore() {
  const storePath = fileStorePath();
  let store;
  let isNewStore = false;

  if (!existsSync(storePath)) {
    // No store on disk yet (a fresh checkout, or the app has never
    // performed a write) — create one with seeded roles rather than
    // asking the operator to trigger an unrelated write first.
    isNewStore = true;
    const now = new Date(0).toISOString();
    store = {
      version: CURRENT_STORE_VERSION,
      roles: SEEDED_ROLES.map((r) => ({ ...r, createdAt: now, updatedAt: now })),
      adminUsers: [],
      users: [],
      credentials: [],
    };
  } else {
    try {
      store = JSON.parse(readFileSync(storePath, "utf8"));
    } catch (error) {
      fail(`Could not read ${storePath}: ${error.message}`);
    }
  }

  store.adminUsers ??= [];
  store.roles ??= SEEDED_ROLES.map((r) => ({
    ...r,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }));
  store.users ??= [];
  store.credentials ??= [];

  if (store.adminUsers.length > 0) {
    fail(
      `${store.adminUsers.length} admin account(s) already exist — this script only creates the FIRST one. ` +
        "Use an authenticated owner's /admin/staff page to add more.",
    );
  }

  const existingUser = store.users.find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );
  if (existingUser) {
    fail(`A user with email ${email} already exists (kind: ${existingUser.kind}).`);
  }

  const ownerRole = store.roles.find((r) => r.name === "owner");
  if (!ownerRole) {
    fail('No "owner" role found in the store — it may be corrupted or from an unexpected version.');
  }

  const now = new Date().toISOString();
  const userId = randomUUID();

  store.users.push({
    id: userId,
    kind: "admin",
    name,
    email,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  store.credentials.push({
    id: randomUUID(),
    userId,
    passwordHash: hashPassword(password),
    sessionVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  store.adminUsers.push({
    id: randomUUID(),
    userId,
    roleId: ownerRole.id,
    createdAt: now,
    updatedAt: now,
  });

  // Match the app's own backup-before-write discipline for this one-off,
  // high-stakes write — mkdir is a no-op if the directory already exists.
  // Nothing to back up for a store this script just created in memory.
  mkdirSync(path.dirname(storePath), { recursive: true });
  if (!isNewStore) {
    const backupPath = `${storePath}.pre-bootstrap-${Date.now()}.bak`;
    writeFileSync(backupPath, readFileSync(storePath));
    console.log(`\n  Previous store backed up to ${backupPath}.`);
  }
  writeFileSync(storePath, JSON.stringify(store, null, 2));

  console.log(`\n  CREATED  ${name} <${email}> as owner.\n`);
  console.log("  Sign in at /admin/login. This script will now refuse to run again.\n");
}

/* ── dispatch ───────────────────────────────────────────────────── */

try {
  if (dataProvider === "postgres") {
    await bootstrapPostgres();
  } else {
    await bootstrapFileStore();
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
