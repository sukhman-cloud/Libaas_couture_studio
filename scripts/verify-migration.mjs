#!/usr/bin/env node
/**
 * Independent migration verification (Phase 5D).
 *
 *   DATABASE_URL=... node scripts/verify-migration.mjs [store-path]
 *
 * Reconstructs a JSON store from the PostgreSQL database (scripts/lib/
 * db-to-store.mjs — plain Prisma queries, no application code) and compares
 * it against the JSON source FIELD BY FIELD:
 *
 *   - entity counts, including embedded rows (addresses, measurement
 *     values, product media/links, cart and wishlist items)
 *   - every entity, by id, deep-equal — ids, timestamps, ownership,
 *     prices in integer paise, statuses, archived records, relationships
 *   - password hashes and reset-token hashes are compared for EQUALITY but
 *     never printed; mismatches report the entity id and differing KEYS only
 *
 * READ-ONLY on both sides. Exit 0 = every check passed; 1 = differences.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { countAll, reconstructStore } from "./lib/db-to-store.mjs";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--")) ?? ".data/dev-store.json";
const storePath = path.resolve(process.cwd(), target);

if (!process.env.DATABASE_URL) {
  console.error("\n  ABORTED  DATABASE_URL is not set.\n");
  process.exit(1);
}

const source = JSON.parse(readFileSync(storePath, "utf8"));

/** Ownership field — v4 `userId`, with the v3 `customerId` fallback, so a
 *  pre-v4 backup imported by the migration script still verifies. */
const normalizeOwner = (row) => {
  if (row.userId !== undefined || row.customerId === undefined) return row;
  const { customerId, ...rest } = row;
  return { ...rest, userId: customerId };
};
for (const key of ["carts", "wishlists", "measurementProfiles"]) {
  source[key] = (source[key] ?? []).map(normalizeOwner);
}

/** Keys whose VALUES must never appear in output. */
const SECRET_KEYS = new Set(["passwordHash", "tokenHash"]);

/** Canonical JSON: sorted keys, so deep equality is a string compare. */
function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

/** Keys that differ between two objects (recursing one level for arrays
 *  and nested objects is unnecessary — naming the top key is enough). */
function differingKeys(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter((k) => canonical(a?.[k]) !== canonical(b?.[k]));
}

let failures = 0;
const pass = (message) => console.log(`  PASS  ${message}`);
const fail = (message) => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

const prisma = new PrismaClient();
const rebuilt = await reconstructStore(prisma);
const dbCounts = await countAll(prisma);
await prisma.$disconnect();

/* ── counts ─────────────────────────────────────────────────────── */

console.log("\n=== counts (source vs database) ===");
const plannedCounts = {
  users: source.users?.length ?? 0,
  credentials: source.credentials?.length ?? 0,
  customerProfiles: source.customerProfiles?.length ?? 0,
  customerAddresses: (source.customerProfiles ?? []).reduce(
    (n, p) => n + (p.addresses?.length ?? 0),
    0,
  ),
  measurementProfiles: source.measurementProfiles?.length ?? 0,
  measurementValues: (source.measurementProfiles ?? []).reduce(
    (n, p) => n + (p.values?.length ?? 0),
    0,
  ),
  passwordResetTokens: source.passwordResetTokens?.length ?? 0,
  mediaAssets: source.mediaAssets?.length ?? 0,
  categories: source.categories?.length ?? 0,
  collections: source.collections?.length ?? 0,
  products: source.products?.length ?? 0,
  productSecondaryCategories: (source.products ?? []).reduce(
    (n, p) => n + (p.secondaryCategoryIds?.length ?? 0),
    0,
  ),
  productCollections: (source.products ?? []).reduce(
    (n, p) => n + (p.collectionIds?.length ?? 0),
    0,
  ),
  productMedia: (source.products ?? []).reduce(
    (n, p) => n + (p.media?.length ?? 0),
    0,
  ),
  carts: source.carts?.length ?? 0,
  cartItems: (source.carts ?? []).reduce((n, c) => n + (c.items?.length ?? 0), 0),
  wishlists: source.wishlists?.length ?? 0,
  wishlistItems: (source.wishlists ?? []).reduce(
    (n, w) => n + (w.items?.length ?? 0),
    0,
  ),
  orders: source.orders?.length ?? 0,
  orderItems: (source.orders ?? []).reduce(
    (n, o) => n + (o.items?.length ?? 0),
    0,
  ),
  customizationRequests: source.customizationRequests?.length ?? 0,
  orderActivities: source.orderActivities?.length ?? 0,
  orderNotes: source.orderNotes?.length ?? 0,
  customizationActivities: source.customizationActivities?.length ?? 0,
  customizationNotes: source.customizationNotes?.length ?? 0,
  payments: source.payments?.length ?? 0,
  paymentAttempts: source.paymentAttempts?.length ?? 0,
  paymentActivities: source.paymentActivities?.length ?? 0,
  paymentWebhookEvents: source.paymentWebhookEvents?.length ?? 0,
  shipments: source.shipments?.length ?? 0,
  shipmentActivities: source.shipmentActivities?.length ?? 0,
  shipmentWebhookEvents: source.shipmentWebhookEvents?.length ?? 0,
};
for (const [table, expected] of Object.entries(plannedCounts)) {
  if (dbCounts[table] === expected) {
    pass(`${table}: ${expected}`);
  } else {
    fail(`${table}: source ${expected}, database ${dbCounts[table]}`);
  }
}

/* ── entities, by id ────────────────────────────────────────────── */

const ENTITY_COLLECTIONS = [
  "users",
  "credentials",
  "customerProfiles",
  "measurementProfiles",
  "passwordResetTokens",
  "mediaAssets",
  "categories",
  "collections",
  "products",
  "carts",
  "wishlists",
  "orders",
  "customizationRequests",
  "orderActivities",
  "orderNotes",
  "customizationActivities",
  "customizationNotes",
  "payments",
  "paymentAttempts",
  "paymentActivities",
  "paymentWebhookEvents",
  "shipments",
  "shipmentActivities",
  "shipmentWebhookEvents",
];

for (const collection of ENTITY_COLLECTIONS) {
  console.log(`\n=== ${collection} ===`);
  const sourceRows = new Map((source[collection] ?? []).map((r) => [r.id, r]));
  const dbRows = new Map((rebuilt[collection] ?? []).map((r) => [r.id, r]));

  const missing = [...sourceRows.keys()].filter((id) => !dbRows.has(id));
  const extra = [...dbRows.keys()].filter((id) => !sourceRows.has(id));
  if (missing.length) fail(`${missing.length} id(s) missing from the database`);
  if (extra.length) fail(`${extra.length} unexpected id(s) in the database`);
  if (!missing.length && !extra.length) {
    pass(`all ${sourceRows.size} id(s) present — ids preserved exactly`);
  }

  let identical = 0;
  for (const [id, sourceRow] of sourceRows) {
    const dbRow = dbRows.get(id);
    if (!dbRow) continue;
    if (canonical(sourceRow) === canonical(dbRow)) {
      identical++;
      continue;
    }
    const keys = differingKeys(sourceRow, dbRow);
    const safe = keys.filter((k) => !SECRET_KEYS.has(k));
    const secret = keys.filter((k) => SECRET_KEYS.has(k));
    fail(
      `${collection} ${id}: differs in [${safe.join(", ")}` +
        (secret.length ? `, ${secret.join(", ")} (values withheld)` : "") +
        "]",
    );
  }
  if (identical === sourceRows.size && sourceRows.size > 0) {
    pass(`every entity deep-equal (timestamps, ownership, values intact)`);
  } else if (sourceRows.size === 0) {
    pass("collection empty on both sides");
  }
}

/* ── credential integrity (equality asserted, values withheld) ──── */

console.log("\n=== credential integrity ===");
const dbCredentials = new Map(rebuilt.credentials.map((c) => [c.id, c]));
let hashesIntact = true;
let scryptIntact = true;
for (const credential of source.credentials ?? []) {
  const dbRow = dbCredentials.get(credential.id);
  if (!dbRow || dbRow.passwordHash !== credential.passwordHash) {
    hashesIntact = false;
  }
  if (!/^scrypt\$/.test(dbRow?.passwordHash ?? "")) scryptIntact = false;
}
hashesIntact
  ? pass("every password hash byte-identical to the source (values withheld)")
  : fail("at least one password hash differs from the source");
scryptIntact
  ? pass("every stored hash still carries the scrypt format prefix")
  : fail("a stored hash lost its scrypt format");

console.log(
  failures === 0
    ? "\n  RESULT: VERIFIED — the database matches the JSON source exactly.\n"
    : `\n  RESULT: ${failures} DIFFERENCE(S) — do not switch providers until resolved.\n`,
);
process.exit(failures === 0 ? 0 : 1);
