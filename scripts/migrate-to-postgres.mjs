#!/usr/bin/env node
/**
 * JSON store → PostgreSQL migration (Phase 5D).
 *
 *   DATABASE_URL=... node scripts/migrate-to-postgres.mjs [store-path] [--dry-run]
 *
 *     store-path   defaults to .data/dev-store.json (a .bak also works)
 *     --dry-run    validate + plan, connect, check the target, import
 *                  NOTHING (the transaction is rolled back deliberately)
 *
 * SAFETY CONTRACT
 *
 * 1. The JSON source is opened READ-ONLY and never modified — the script
 *    fingerprints it before and after and aborts loudly if that ever fails.
 * 2. The source must pass scripts/validate-store.mjs (spawned, --json)
 *    before a single row is written. NOT READY means no migration.
 * 3. The target database must be EMPTY (every table, zero rows). This is
 *    the re-runnability strategy: the whole import is ONE transaction, so
 *    a failed run leaves the database exactly as it found it — empty — and
 *    can simply be run again. There is no partial-import state to repair
 *    and no duplicate-detection heuristic to trust.
 * 4. IDs, timestamps, password hashes, token hashes, archived records and
 *    every relationship are preserved byte-for-byte. Nothing is rehashed,
 *    regenerated or re-stamped.
 * 5. Output is COUNTS ONLY — no emails, no hashes, no personal data.
 *
 * Both `userId` (store v4) and legacy `customerId` (v3 backups) spellings
 * are accepted for ownership, exactly like the validator.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { countAll } from "./lib/db-to-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const target = args.find((a) => !a.startsWith("--")) ?? ".data/dev-store.json";
const storePath = path.resolve(process.cwd(), target);

const fail = (message) => {
  console.error(`\n  ABORTED  ${message}\n`);
  process.exit(1);
};

if (!process.env.DATABASE_URL) {
  fail(
    "DATABASE_URL is not set. Pass the target PostgreSQL connection string via the environment — never hardcode it.",
  );
}

/* ── 1. read the source (read-only) and fingerprint it ──────────── */

let sourceBytes;
try {
  sourceBytes = readFileSync(storePath);
} catch (error) {
  fail(`Could not read ${storePath}: ${error.message}`);
}
const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
let store;
try {
  store = JSON.parse(sourceBytes.toString("utf8"));
} catch {
  // Deliberately no error detail: a V8 SyntaxError can quote file content.
  fail(`${storePath} is not valid JSON. Run the validator for details.`);
}

/* ── 2. the existing validator is the gatekeeper ────────────────── */

try {
  execFileSync(
    process.execPath,
    [path.join(here, "validate-store.mjs"), storePath, "--json"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  fail(
    `The store failed validation (validate-store.mjs exit ${error.status}). ` +
      "Run `node scripts/validate-store.mjs` for the full report. NOT READY means no migration.",
  );
}
console.log(`\n  Source validated: ${storePath}`);
console.log(`  SHA-256: ${sourceDigest}`);

/** Ownership field — v4 `userId`, with the v3 `customerId` fallback. */
const ownerOf = (row) => row.userId ?? row.customerId;
const date = (value) => new Date(value);

/* ── 3. plan (counts from the source) ───────────────────────────── */

// Appointments still have no tables (deferred). Refuse loudly if a store
// ever holds one — silently dropping records is exactly what this script
// must never do. Orders became real tables in Phase 6C and are imported.
if ((store.appointments ?? []).length > 0) {
  fail(
    `the store contains ${store.appointments.length} appointments row(s), but this phase has no appointments tables. ` +
      "Migrating them silently would lose data — extend the schema first.",
  );
}

const src = {
  users: store.users ?? [],
  credentials: store.credentials ?? [],
  customerProfiles: store.customerProfiles ?? [],
  measurementProfiles: store.measurementProfiles ?? [],
  passwordResetTokens: store.passwordResetTokens ?? [],
  mediaAssets: store.mediaAssets ?? [],
  categories: store.categories ?? [],
  collections: store.collections ?? [],
  products: store.products ?? [],
  carts: store.carts ?? [],
  wishlists: store.wishlists ?? [],
  orders: store.orders ?? [],
  customizationRequests: store.customizationRequests ?? [],
  orderActivities: store.orderActivities ?? [],
  orderNotes: store.orderNotes ?? [],
};

const planned = {
  users: src.users.length,
  credentials: src.credentials.length,
  customerProfiles: src.customerProfiles.length,
  customerAddresses: src.customerProfiles.reduce(
    (n, p) => n + (p.addresses?.length ?? 0),
    0,
  ),
  measurementProfiles: src.measurementProfiles.length,
  measurementValues: src.measurementProfiles.reduce(
    (n, p) => n + (p.values?.length ?? 0),
    0,
  ),
  passwordResetTokens: src.passwordResetTokens.length,
  mediaAssets: src.mediaAssets.length,
  categories: src.categories.length,
  collections: src.collections.length,
  products: src.products.length,
  productSecondaryCategories: src.products.reduce(
    (n, p) => n + (p.secondaryCategoryIds?.length ?? 0),
    0,
  ),
  productCollections: src.products.reduce(
    (n, p) => n + (p.collectionIds?.length ?? 0),
    0,
  ),
  productMedia: src.products.reduce((n, p) => n + (p.media?.length ?? 0), 0),
  carts: src.carts.length,
  cartItems: src.carts.reduce((n, c) => n + (c.items?.length ?? 0), 0),
  wishlists: src.wishlists.length,
  wishlistItems: src.wishlists.reduce((n, w) => n + (w.items?.length ?? 0), 0),
  orders: src.orders.length,
  orderItems: src.orders.reduce((n, o) => n + (o.items?.length ?? 0), 0),
  customizationRequests: src.customizationRequests.length,
  orderActivities: src.orderActivities.length,
  orderNotes: src.orderNotes.length,
};

// The PostgreSQL provider looks emails up lowercase and SKUs uppercase
// (matching what the validation boundary stores). Warn — counts only — if
// this store holds unnormalized values, because those rows would not be
// findable by email/SKU lookup after the switch.
const unnormalizedEmails = src.users.filter(
  (u) => u.email && u.email !== u.email.toLowerCase(),
).length;
const unnormalizedSkus = src.products.filter(
  (p) => p.sku !== p.sku.toUpperCase(),
).length;
if (unnormalizedEmails > 0 || unnormalizedSkus > 0) {
  console.warn(
    `\n  WARNING  ${unnormalizedEmails} email(s) / ${unnormalizedSkus} SKU(s) are not in normalized form; ` +
      "email/SKU lookups on the postgres provider assume lowercase emails and uppercase SKUs.",
  );
}

console.log("\n  PLANNED IMPORT");
for (const [key, value] of Object.entries(planned)) {
  console.log(`    ${key.padEnd(28)} ${String(value).padStart(5)}`);
}

/* ── 4. import — one transaction, empty target only ─────────────── */

const prisma = new PrismaClient();

class DryRunRollback extends Error {}

async function importAll(tx) {
  // The target must be empty — see the safety contract.
  const existing = await countAll(tx);
  const occupied = Object.entries(existing).filter(([, count]) => count > 0);
  if (occupied.length > 0) {
    throw new Error(
      "the target database is not empty (" +
        occupied.map(([table, count]) => `${table}=${count}`).join(", ") +
        "). Use a clean database, or reset a scratch one with `prisma migrate reset`. " +
        "This script never merges into existing data.",
    );
  }

  // Dependency order. Categories are created without parents first, then
  // re-linked, so hierarchy order in the source can never matter.
  await tx.user.createMany({
    data: src.users.map((u) => ({
      id: u.id,
      kind: u.kind,
      name: u.name,
      email: u.email ?? null,
      phone: u.phone ?? null,
      isActive: u.isActive,
      createdAt: date(u.createdAt),
      updatedAt: date(u.updatedAt),
    })),
  });

  await tx.authCredential.createMany({
    data: src.credentials.map((c) => ({
      id: c.id,
      userId: c.userId,
      passwordHash: c.passwordHash, // verbatim — never rehashed
      sessionVersion: c.sessionVersion,
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
    })),
  });

  await tx.passwordResetToken.createMany({
    data: src.passwordResetTokens.map((t) => ({
      id: t.id,
      userId: t.userId,
      tokenHash: t.tokenHash, // SHA-256 as stored; expiry/single-use intact
      expiresAt: date(t.expiresAt),
      usedAt: t.usedAt ? date(t.usedAt) : null,
      createdAt: date(t.createdAt),
    })),
  });

  await tx.customerProfile.createMany({
    data: src.customerProfiles.map((p) => ({
      id: p.id,
      userId: ownerOf(p),
      defaultAddressId: null, // linked after the address rows exist
      acceptsMarketing: p.acceptsMarketing,
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt),
    })),
  });
  await tx.customerAddress.createMany({
    data: src.customerProfiles.flatMap((p) =>
      (p.addresses ?? []).map((a, position) => ({
        id: a.id,
        profileId: p.id,
        position,
        label: a.label,
        fullName: a.fullName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2 ?? null,
        locality: a.locality ?? null,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
      })),
    ),
  });
  for (const p of src.customerProfiles) {
    if (p.defaultAddressId) {
      await tx.customerProfile.update({
        where: { id: p.id },
        data: { defaultAddressId: p.defaultAddressId },
      });
    }
  }

  await tx.measurementProfile.createMany({
    data: src.measurementProfiles.map((m) => ({
      id: m.id,
      userId: ownerOf(m),
      label: m.label,
      unit: m.unit,
      fitPreference: m.fitPreference ?? null,
      notes: m.notes ?? null,
      isDefault: m.isDefault,
      archivedAt: m.archivedAt ? date(m.archivedAt) : null, // archived kept
      createdAt: date(m.createdAt),
      updatedAt: date(m.updatedAt),
    })),
  });
  await tx.measurementValue.createMany({
    data: src.measurementProfiles.flatMap((m) =>
      (m.values ?? []).map((v, position) => ({
        profileId: m.id,
        key: v.key,
        value: v.value,
        position,
      })),
    ),
  });

  await tx.mediaAsset.createMany({
    data: src.mediaAssets.map((a) => ({
      id: a.id,
      storageKey: a.storageKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: date(a.createdAt),
    })),
  });

  await tx.category.createMany({
    data: src.categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description ?? null,
      parentId: null, // linked below
      mediaId: c.mediaId ?? null,
      sortOrder: c.sortOrder,
      status: c.status,
      archivedAt: c.archivedAt ? date(c.archivedAt) : null,
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
    })),
  });
  for (const c of src.categories) {
    if (c.parentId) {
      await tx.category.update({
        where: { id: c.id },
        data: { parentId: c.parentId },
      });
    }
  }

  await tx.collection.createMany({
    data: src.collections.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description ?? null,
      coverMediaId: c.coverMediaId ?? null,
      sortOrder: c.sortOrder,
      status: c.status,
      archivedAt: c.archivedAt ? date(c.archivedAt) : null,
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
    })),
  });

  await tx.product.createMany({
    data: src.products.map((p) => ({
      id: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription ?? null,
      description: p.description,
      categoryId: p.categoryId ?? null,
      priceAmount: BigInt(p.price.amount), // integer paise, exactly
      priceCurrency: p.price.currency,
      salePriceAmount: p.salePrice ? BigInt(p.salePrice.amount) : null,
      salePriceCurrency: p.salePrice?.currency ?? null,
      status: p.status,
      availability: p.availability,
      isFeatured: p.isFeatured,
      fabric: p.attributes?.fabric ?? null,
      colour: p.attributes?.colour ?? null,
      occasion: p.attributes?.occasion ?? null,
      work: p.attributes?.work ?? null,
      fit: p.attributes?.fit ?? null,
      attributesExtra: p.attributes?.extra ?? undefined,
      tags: p.tags ?? [],
      stitchingAvailable: p.stitchingAvailable,
      customizationAvailable: p.customizationAvailable,
      archivedAt: p.archivedAt ? date(p.archivedAt) : null,
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt),
    })),
  });
  await tx.productSecondaryCategory.createMany({
    data: src.products.flatMap((p) =>
      (p.secondaryCategoryIds ?? []).map((categoryId, position) => ({
        productId: p.id,
        categoryId,
        position,
      })),
    ),
  });
  await tx.productCollection.createMany({
    data: src.products.flatMap((p) =>
      (p.collectionIds ?? []).map((collectionId, position) => ({
        productId: p.id,
        collectionId,
        position,
      })),
    ),
  });
  await tx.productMedia.createMany({
    data: src.products.flatMap((p) =>
      (p.media ?? []).map((m, position) => ({
        id: m.id,
        productId: p.id,
        mediaId: m.mediaId,
        alt: m.alt,
        sortOrder: m.sortOrder,
        isPrimary: m.isPrimary,
        position,
        createdAt: date(m.createdAt),
      })),
    ),
  });

  await tx.wishlist.createMany({
    data: src.wishlists.map((w) => ({
      id: w.id,
      userId: ownerOf(w),
      createdAt: date(w.createdAt),
      updatedAt: date(w.updatedAt),
    })),
  });
  await tx.wishlistItem.createMany({
    data: src.wishlists.flatMap((w) =>
      (w.items ?? []).map((item, position) => ({
        id: item.id,
        wishlistId: w.id,
        productId: item.productId,
        position,
        createdAt: date(item.createdAt),
      })),
    ),
  });

  await tx.cart.createMany({
    data: src.carts.map((c) => ({
      id: c.id,
      userId: ownerOf(c),
      createdAt: date(c.createdAt),
      updatedAt: date(c.updatedAt),
    })),
  });
  await tx.cartItem.createMany({
    data: src.carts.flatMap((c) =>
      (c.items ?? []).map((item, position) => ({
        id: item.id,
        cartId: c.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceAmount: BigInt(item.unitPrice.amount), // snapshot, exactly
        unitPriceCurrency: item.unitPrice.currency,
        configurationKey: item.configurationKey ?? "",
        stitching: item.stitching ?? undefined,
        customizationRequestId: item.customizationRequestId ?? null,
        notes: item.notes ?? null,
        position,
        createdAt: date(item.createdAt),
        updatedAt: date(item.updatedAt),
      })),
    ),
  });

  await tx.order.createMany({
    data: src.orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      userId: ownerOf(o),
      status: o.status,
      currency: o.currency,
      subtotalAmount: BigInt(o.subtotal.amount),
      shippingAmount: BigInt(o.shippingAmount.amount),
      taxAmount: BigInt(o.taxAmount.amount),
      discountAmount: BigInt(o.discountAmount.amount),
      totalAmount: BigInt(o.total.amount),
      customerName: o.customer.name,
      customerEmail: o.customer.email ?? null,
      customerPhone: o.customer.phone ?? null,
      shipFullName: o.shippingAddress.fullName,
      shipPhone: o.shippingAddress.phone,
      shipLine1: o.shippingAddress.line1,
      shipLine2: o.shippingAddress.line2 ?? null,
      shipLocality: o.shippingAddress.locality ?? null,
      shipCity: o.shippingAddress.city,
      shipState: o.shippingAddress.state,
      shipPostalCode: o.shippingAddress.postalCode,
      shipCountry: o.shippingAddress.country,
      idempotencyKey: o.idempotencyKey,
      requestFingerprint: o.requestFingerprint,
      createdAt: date(o.createdAt),
      updatedAt: date(o.updatedAt),
    })),
  });
  await tx.orderItem.createMany({
    data: src.orders.flatMap((o) =>
      (o.items ?? []).map((item, position) => ({
        id: item.id,
        orderId: o.id,
        productId: item.productId,
        nameSnapshot: item.nameSnapshot,
        slugSnapshot: item.slugSnapshot,
        quantity: item.quantity,
        unitPriceAmount: BigInt(item.unitPrice.amount),
        lineSubtotalAmount: BigInt(item.lineSubtotal.amount),
        currency: item.unitPrice.currency,
        configurationKey: item.configurationKey ?? "",
        stitching: item.stitching ?? undefined,
        customizationRequestId: item.customizationRequestId ?? null,
        notes: item.notes ?? null,
        position,
      })),
    ),
  });

  await tx.orderActivity.createMany({
    data: src.orderActivities.map((activity) => ({
      id: activity.id,
      orderId: activity.orderId,
      type: activity.type,
      actorUserId: activity.actorUserId ?? null,
      fromStatus: activity.fromStatus ?? null,
      toStatus: activity.toStatus ?? null,
      metadata: activity.metadata ?? undefined,
      createdAt: date(activity.createdAt),
    })),
  });
  await tx.orderNote.createMany({
    data: src.orderNotes.map((note) => ({
      id: note.id,
      orderId: note.orderId,
      authorUserId: note.authorUserId ?? null,
      authorName: note.authorName,
      body: note.body,
      createdAt: date(note.createdAt),
    })),
  });

  await tx.customizationRequest.createMany({
    data: src.customizationRequests.map((request) => ({
      id: request.id,
      userId: request.userId,
      productId: request.productId ?? null,
      measurementProfileId: request.measurementProfileId ?? null,
      details: request.details,
      status: request.status,
      createdAt: new Date(request.createdAt),
      updatedAt: new Date(request.updatedAt),
    })),
  });

  // In-transaction verification: every planned row must be present.
  const imported = await countAll(tx);
  const mismatches = Object.entries(planned).filter(
    ([table, count]) => imported[table] !== count,
  );
  if (mismatches.length > 0) {
    throw new Error(
      "post-import count mismatch (" +
        mismatches
          .map(([t, c]) => `${t}: planned ${c}, imported ${imported[t]}`)
          .join("; ") +
        ") — rolling back.",
    );
  }
  return imported;
}

try {
  const imported = await prisma.$transaction(
    async (tx) => {
      const counts = await importAll(tx);
      if (dryRun) throw new DryRunRollback();
      return counts;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  console.log("\n  IMPORTED");
  for (const [key, value] of Object.entries(imported)) {
    console.log(`    ${key.padEnd(28)} ${String(value).padStart(5)}`);
  }
  console.log(
    "\n  RESULT: MIGRATED — one transaction, counts verified in-transaction.",
  );
  console.log(
    "  Run `node scripts/verify-migration.mjs` for the independent field-level check.",
  );
} catch (error) {
  if (error instanceof DryRunRollback) {
    console.log(
      "\n  RESULT: DRY RUN OK — the import ran fully and was rolled back on purpose; the database is untouched.",
    );
  } else {
    await prisma.$disconnect().catch(() => {});
    // Prisma validation errors can echo row data (emails, hashes) in their
    // message. Print only the error's first line, capped — the database
    // rolled back, so the operator reruns after fixing the store.
    const firstLine = String(error.message ?? error)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? "unknown error";
    const code = error.code ? `${error.code}: ` : "";
    fail(`nothing was imported — ${code}${firstLine.slice(0, 300)}`);
  }
} finally {
  await prisma.$disconnect().catch(() => {});
}

/* ── 5. prove the source was never touched ──────────────────────── */

const afterDigest = createHash("sha256")
  .update(readFileSync(storePath))
  .digest("hex");
if (afterDigest !== sourceDigest) {
  // Should be impossible — this script never opens the file for writing.
  fail("the source file changed during migration. Investigate before trusting either side.");
}
console.log("  Source untouched (SHA-256 verified).\n");
