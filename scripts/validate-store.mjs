#!/usr/bin/env node
/**
 * Migration-readiness validator for the JSON data store.
 *
 * READ-ONLY BY CONTRACT. This script opens the store file, checks it, and
 * prints a report. It never writes, repairs, moves or deletes anything —
 * so it is always safe to run against real data, including a backup.
 *
 *   node scripts/validate-store.mjs                  # .data/dev-store.json
 *   node scripts/validate-store.mjs <path>           # any store or .bak file
 *   node scripts/validate-store.mjs --json           # machine-readable output
 *
 * Exit codes:  0 = ready to migrate   1 = problems found   2 = unreadable
 *
 * Ownership note: carts, wishlists and measurement profiles are owned by a
 * USER, not by a CustomerProfile. Store version 4 renamed the field from
 * `customerId` to `userId`; both spellings are accepted here so the
 * validator can also inspect pre-v4 files and backups.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const target = args.find((a) => !a.startsWith("--")) ?? ".data/dev-store.json";
const storePath = path.resolve(process.cwd(), target);

/* ── report accumulator ─────────────────────────────────────────── */

const problems = [];
const notes = [];
/** @param {string} kind @param {string} message @param {object} [context] */
const problem = (kind, message, context) =>
  problems.push({ kind, message, ...(context ? { context } : {}) });
const note = (message) => notes.push(message);

/* ── load ───────────────────────────────────────────────────────── */

let store;
try {
  store = JSON.parse(readFileSync(storePath, "utf8"));
} catch (error) {
  const message = `Could not read ${storePath}: ${error.message}`;
  if (asJson) console.log(JSON.stringify({ ok: false, unreadable: message }, null, 2));
  else console.error(`\n  UNREADABLE  ${message}\n`);
  process.exit(2);
}

const COLLECTIONS = [
  "users",
  "credentials",
  "customerProfiles",
  "measurementProfiles",
  "passwordResetTokens",
  "products",
  "categories",
  "collections",
  "mediaAssets",
  "carts",
  "wishlists",
  "orders",
  "appointments",
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

for (const key of COLLECTIONS) {
  if (store[key] !== undefined && !Array.isArray(store[key])) {
    problem("shape", `Collection "${key}" is present but is not an array.`);
  }
}
const rows = (key) => (Array.isArray(store[key]) ? store[key] : []);

/** Owner id of a cart / wishlist / measurement profile, either spelling. */
const ownerOf = (row) => row.userId ?? row.customerId;

/* ── helpers ────────────────────────────────────────────────────── */

function checkDuplicates(list, label, keyOf, keyName) {
  const seen = new Map();
  for (const row of list) {
    const key = keyOf(row);
    if (key === undefined || key === null || key === "") continue;
    if (seen.has(key)) {
      problem("duplicate", `Duplicate ${keyName} in ${label}: "${key}".`, {
        ids: [seen.get(key), row.id],
      });
    } else {
      seen.set(key, row.id);
    }
  }
}

function checkIds(list, label) {
  const seen = new Set();
  for (const row of list) {
    if (typeof row.id !== "string" || row.id === "") {
      problem("id", `A row in ${label} has no usable id.`);
      continue;
    }
    if (seen.has(row.id)) {
      problem("duplicate", `Duplicate primary key in ${label}: "${row.id}".`);
    }
    seen.add(row.id);
  }
}

function checkTimestamps(list, label, { requireUpdated = true } = {}) {
  for (const row of list) {
    for (const field of requireUpdated ? ["createdAt", "updatedAt"] : ["createdAt"]) {
      const value = row[field];
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        problem("timestamp", `${label} ${row.id}: ${field} is missing or not a valid date.`);
      }
    }
  }
}

/**
 * Money must be an integer count of paise — never a float, never negative.
 * `optional` is only for genuinely nullable columns (a sale price). A
 * required money value that is missing is a blocking problem: the target
 * column is NOT NULL, so the import would fail mid-transaction instead of
 * here, where it is cheap to see.
 */
function checkMoney(money, where, { optional = false } = {}) {
  if (money === undefined || money === null) {
    if (!optional) problem("money", `${where}: value is missing (required, NOT NULL in the target schema).`);
    return;
  }
  if (typeof money !== "object") {
    problem("money", `${where}: money value is not an object.`);
    return;
  }
  const { amount, currency } = money;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    problem("money", `${where}: amount is not a finite number.`);
  } else if (!Number.isInteger(amount)) {
    problem("money", `${where}: amount ${amount} is not an integer — money must be whole paise.`);
  } else if (amount < 0) {
    problem("money", `${where}: amount ${amount} is negative.`);
  }
  if (currency !== "INR") {
    problem("money", `${where}: currency is "${currency}", expected "INR".`);
  }
}

/* ── index the store ────────────────────────────────────────────── */

const users = rows("users");
const credentials = rows("credentials");
const profiles = rows("customerProfiles");
const measurements = rows("measurementProfiles");
const resetTokens = rows("passwordResetTokens");
const products = rows("products");
const categories = rows("categories");
const collections = rows("collections");
const mediaAssets = rows("mediaAssets");
const carts = rows("carts");
const wishlists = rows("wishlists");

const userIds = new Set(users.map((u) => u.id));
const productIds = new Set(products.map((p) => p.id));
const categoryIds = new Set(categories.map((c) => c.id));
const collectionIds = new Set(collections.map((c) => c.id));
const mediaIds = new Set(mediaAssets.map((m) => m.id));

/* ── primary keys, uniqueness, timestamps ───────────────────────── */

for (const [list, label] of [
  [users, "users"],
  [credentials, "credentials"],
  [profiles, "customerProfiles"],
  [measurements, "measurementProfiles"],
  [products, "products"],
  [categories, "categories"],
  [collections, "collections"],
  [mediaAssets, "mediaAssets"],
  [carts, "carts"],
  [wishlists, "wishlists"],
  [resetTokens, "passwordResetTokens"],
]) {
  checkIds(list, label);
}

// Case-insensitive, because Postgres will enforce these with a lowered index.
checkDuplicates(users, "users", (u) => u.email?.trim().toLowerCase(), "email");
checkDuplicates(products, "products", (p) => p.sku?.trim().toUpperCase(), "SKU");
checkDuplicates(products, "products", (p) => p.slug?.trim().toLowerCase(), "slug");
checkDuplicates(categories, "categories", (c) => c.slug?.trim().toLowerCase(), "slug");
checkDuplicates(collections, "collections", (c) => c.slug?.trim().toLowerCase(), "slug");
checkDuplicates(mediaAssets, "mediaAssets", (m) => m.storageKey, "storage key");
checkDuplicates(resetTokens, "passwordResetTokens", (t) => t.tokenHash, "token hash");

// One credential, one profile, one cart, one wishlist per user.
checkDuplicates(credentials, "credentials", (c) => c.userId, "userId");
checkDuplicates(profiles, "customerProfiles", (p) => p.userId, "userId");
checkDuplicates(carts, "carts", ownerOf, "owner");
checkDuplicates(wishlists, "wishlists", ownerOf, "owner");

checkTimestamps(users, "user");
checkTimestamps(credentials, "credential");
checkTimestamps(profiles, "customerProfile");
checkTimestamps(measurements, "measurementProfile");
checkTimestamps(products, "product");
checkTimestamps(categories, "category");
checkTimestamps(collections, "collection");
checkTimestamps(carts, "cart");
checkTimestamps(wishlists, "wishlist");
checkTimestamps(mediaAssets, "mediaAsset", { requireUpdated: false });
checkTimestamps(resetTokens, "passwordResetToken", { requireUpdated: false });

/* ── identity ───────────────────────────────────────────────────── */

for (const user of users) {
  if (user.kind !== "customer" && user.kind !== "admin") {
    problem("identity", `User ${user.id}: kind is "${user.kind}", expected customer or admin.`);
  }
  if (typeof user.isActive !== "boolean") {
    problem("identity", `User ${user.id}: isActive is not a boolean.`);
  }
  if (user.email !== undefined && typeof user.email !== "string") {
    problem("identity", `User ${user.id}: email is not a string.`);
  }
}

for (const credential of credentials) {
  if (!userIds.has(credential.userId)) {
    problem("orphan", `Credential ${credential.id} references missing user ${credential.userId}.`);
  }
  // The hash is opaque data that must migrate verbatim — only its shape is checked.
  if (typeof credential.passwordHash !== "string" || !credential.passwordHash.startsWith("scrypt$")) {
    problem("credential", `Credential ${credential.id}: passwordHash is missing or not a scrypt string.`);
  }
  if (!Number.isInteger(credential.sessionVersion) || credential.sessionVersion < 1) {
    problem("credential", `Credential ${credential.id}: sessionVersion must be a positive integer.`);
  }
}

for (const user of users) {
  if (user.kind === "customer" && !credentials.some((c) => c.userId === user.id)) {
    problem("orphan", `User ${user.id} has no credential — the account cannot sign in.`);
  }
}

for (const token of resetTokens) {
  if (!userIds.has(token.userId)) {
    problem("orphan", `Password reset token ${token.id} references missing user ${token.userId}.`);
  }
}
const spentTokens = resetTokens.filter(
  (t) => t.usedAt || Date.parse(t.expiresAt) < Date.now(),
).length;
if (spentTokens > 0) {
  note(`${spentTokens} used/expired password reset token(s) can be dropped rather than migrated.`);
}

/* ── customer data ──────────────────────────────────────────────── */

for (const profile of profiles) {
  if (!userIds.has(profile.userId)) {
    problem("orphan", `Customer profile ${profile.id} references missing user ${profile.userId}.`);
  }
  const addresses = Array.isArray(profile.addresses) ? profile.addresses : [];
  if (!Array.isArray(profile.addresses)) {
    problem("shape", `Customer profile ${profile.id}: addresses is not an array.`);
  }
  const addressIds = new Set();
  for (const address of addresses) {
    if (typeof address.id !== "string" || address.id === "") {
      problem("id", `Customer profile ${profile.id}: an address has no id.`);
    } else if (addressIds.has(address.id)) {
      problem("duplicate", `Customer profile ${profile.id}: duplicate address id "${address.id}".`);
    }
    addressIds.add(address.id);
  }
  if (profile.defaultAddressId && !addressIds.has(profile.defaultAddressId)) {
    problem(
      "reference",
      `Customer profile ${profile.id}: defaultAddressId "${profile.defaultAddressId}" is not one of its addresses.`,
    );
  }
}

for (const measurement of measurements) {
  const owner = ownerOf(measurement);
  if (!owner) {
    problem("ownership", `Measurement profile ${measurement.id} has no owner id.`);
  } else if (!userIds.has(owner)) {
    // The classic trap: a CustomerProfile id here instead of a User id.
    const looksLikeProfile = profiles.some((p) => p.id === owner);
    problem(
      "ownership",
      looksLikeProfile
        ? `Measurement profile ${measurement.id} is owned by a CustomerProfile id, not a User id.`
        : `Measurement profile ${measurement.id} references missing user ${owner}.`,
    );
  }
  if (measurement.unit !== "cm" && measurement.unit !== "in") {
    problem("shape", `Measurement profile ${measurement.id}: unit is "${measurement.unit}".`);
  }
  const values = Array.isArray(measurement.values) ? measurement.values : [];
  if (!Array.isArray(measurement.values)) {
    problem("shape", `Measurement profile ${measurement.id}: values is not an array.`);
  }
  for (const value of values) {
    if (typeof value.key !== "string" || !value.key) {
      problem("shape", `Measurement profile ${measurement.id}: a value has no key.`);
    }
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
      problem("shape", `Measurement profile ${measurement.id}: value "${value.key}" is not a number.`);
    }
  }
}

/* ── catalog ────────────────────────────────────────────────────── */

const STATUSES = new Set(["draft", "published", "archived"]);
const ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "ready",
  "completed",
  "cancelled",
]);
const CUSTOMIZATION_STATUSES = new Set([
  "pending", "reviewing", "draft", "quoted", "approved", "in_progress",
  "completed", "rejected", "cancelled",
]);
const AVAILABILITIES = new Set(["available", "made_to_order", "out_of_stock", "discontinued"]);

for (const category of categories) {
  if (!STATUSES.has(category.status)) {
    problem("shape", `Category ${category.id}: status is "${category.status}".`);
  }
  if (category.parentId && !categoryIds.has(category.parentId)) {
    problem("orphan", `Category ${category.id} references missing parent ${category.parentId}.`);
  }
  if (category.parentId === category.id) {
    problem("reference", `Category ${category.id} is its own parent.`);
  }
  if (category.mediaId && !mediaIds.has(category.mediaId)) {
    problem("media", `Category ${category.id} references missing media asset ${category.mediaId}.`);
  }
}

// Walk the parent chain so a cycle cannot survive into a self-referencing FK.
for (const category of categories) {
  const seen = new Set([category.id]);
  let cursor = category.parentId;
  while (cursor) {
    if (seen.has(cursor)) {
      problem("reference", `Category ${category.id} sits in a parent cycle.`);
      break;
    }
    seen.add(cursor);
    cursor = categories.find((c) => c.id === cursor)?.parentId;
  }
}

for (const collection of collections) {
  if (!STATUSES.has(collection.status)) {
    problem("shape", `Collection ${collection.id}: status is "${collection.status}".`);
  }
  if (collection.coverMediaId && !mediaIds.has(collection.coverMediaId)) {
    problem("media", `Collection ${collection.id} references missing media asset ${collection.coverMediaId}.`);
  }
}

const KEY_PATTERN = /^[a-f0-9-]{36}\.[a-z0-9]{2,5}$/;
for (const asset of mediaAssets) {
  if (typeof asset.storageKey !== "string" || !KEY_PATTERN.test(asset.storageKey)) {
    problem("media", `Media asset ${asset.id}: storageKey "${asset.storageKey}" is not a safe opaque key.`);
  }
  if (typeof asset.mimeType !== "string" || !asset.mimeType.startsWith("image/")) {
    problem("media", `Media asset ${asset.id}: mimeType is "${asset.mimeType}".`);
  }
  if (!Number.isInteger(asset.size) || asset.size < 0) {
    problem("media", `Media asset ${asset.id}: size is not a non-negative integer.`);
  }
}

const referencedMedia = new Set();
for (const product of products) {
  if (!STATUSES.has(product.status)) {
    problem("shape", `Product ${product.id}: status is "${product.status}".`);
  }
  if (!AVAILABILITIES.has(product.availability)) {
    problem("shape", `Product ${product.id}: availability is "${product.availability}".`);
  }
  if (typeof product.sku !== "string" || !product.sku.trim()) {
    problem("shape", `Product ${product.id}: SKU is missing.`);
  }
  if (typeof product.slug !== "string" || !product.slug.trim()) {
    problem("shape", `Product ${product.id}: slug is missing.`);
  }

  checkMoney(product.price, `Product ${product.id} price`);
  if (product.salePrice !== undefined && product.salePrice !== null) {
    checkMoney(product.salePrice, `Product ${product.id} salePrice`, { optional: true });
    if (
      Number.isInteger(product.salePrice.amount) &&
      Number.isInteger(product.price?.amount) &&
      product.salePrice.amount >= product.price.amount
    ) {
      problem(
        "money",
        `Product ${product.id}: salePrice ${product.salePrice.amount} is not below price ${product.price.amount}.`,
      );
    }
  }

  if (product.categoryId && !categoryIds.has(product.categoryId)) {
    problem("orphan", `Product ${product.id} references missing category ${product.categoryId}.`);
  }
  for (const id of product.secondaryCategoryIds ?? []) {
    if (!categoryIds.has(id)) {
      problem("orphan", `Product ${product.id} references missing secondary category ${id}.`);
    }
    if (id === product.categoryId) {
      problem("reference", `Product ${product.id}: ${id} is both primary and secondary category.`);
    }
  }
  const secondarySeen = new Set();
  for (const id of product.secondaryCategoryIds ?? []) {
    if (secondarySeen.has(id)) {
      problem("duplicate", `Product ${product.id}: secondary category ${id} listed twice.`);
    }
    secondarySeen.add(id);
  }

  const collectionSeen = new Set();
  for (const id of product.collectionIds ?? []) {
    if (!collectionIds.has(id)) {
      problem("orphan", `Product ${product.id} references missing collection ${id}.`);
    }
    if (collectionSeen.has(id)) {
      problem("duplicate", `Product ${product.id}: collection ${id} listed twice.`);
    }
    collectionSeen.add(id);
  }

  const media = Array.isArray(product.media) ? product.media : [];
  if (!Array.isArray(product.media)) {
    problem("shape", `Product ${product.id}: media is not an array.`);
  }
  let primaryCount = 0;
  const sortOrders = new Set();
  for (const item of media) {
    if (!mediaIds.has(item.mediaId)) {
      problem("media", `Product ${product.id} references missing media asset ${item.mediaId}.`);
    }
    referencedMedia.add(item.mediaId);
    if (item.isPrimary) primaryCount++;
    if (!Number.isInteger(item.sortOrder)) {
      problem("shape", `Product ${product.id}: media ${item.id} has a non-integer sortOrder.`);
    } else if (sortOrders.has(item.sortOrder)) {
      problem("duplicate", `Product ${product.id}: two media rows share sortOrder ${item.sortOrder}.`);
    }
    sortOrders.add(item.sortOrder);
  }
  if (media.length > 0 && primaryCount === 0) {
    problem("media", `Product ${product.id} has ${media.length} image(s) but none marked primary.`);
  }
  if (primaryCount > 1) {
    problem("media", `Product ${product.id} has ${primaryCount} primary images; exactly one is allowed.`);
  }

  if (product.attributes !== undefined && typeof product.attributes !== "object") {
    problem("shape", `Product ${product.id}: attributes is not an object.`);
  }
  if (product.tags !== undefined && !Array.isArray(product.tags)) {
    problem("shape", `Product ${product.id}: tags is not an array.`);
  }
}

const orphanMedia = mediaAssets.filter((m) => !referencedMedia.has(m.id));
const usedByCategory = new Set(categories.map((c) => c.mediaId).filter(Boolean));
const usedByCollection = new Set(collections.map((c) => c.coverMediaId).filter(Boolean));
const trulyOrphan = orphanMedia.filter((m) => !usedByCategory.has(m.id) && !usedByCollection.has(m.id));
if (trulyOrphan.length > 0) {
  note(`${trulyOrphan.length} media asset(s) are not referenced by any product, category or collection.`);
}

/* ── shopping ───────────────────────────────────────────────────── */

function checkOwner(row, label) {
  const owner = ownerOf(row);
  if (!owner) {
    problem("ownership", `${label} ${row.id} has no owner id.`);
    return;
  }
  if (!userIds.has(owner)) {
    const looksLikeProfile = profiles.some((p) => p.id === owner);
    problem(
      "ownership",
      looksLikeProfile
        ? `${label} ${row.id} is owned by a CustomerProfile id, not a User id.`
        : `${label} ${row.id} references missing user ${owner}.`,
    );
  }
}

for (const cart of carts) {
  checkOwner(cart, "Cart");
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!Array.isArray(cart.items)) problem("shape", `Cart ${cart.id}: items is not an array.`);

  const itemIds = new Set();
  const lineKeys = new Set();
  for (const item of items) {
    if (itemIds.has(item.id)) problem("duplicate", `Cart ${cart.id}: duplicate item id "${item.id}".`);
    itemIds.add(item.id);

    if (!productIds.has(item.productId)) {
      problem("orphan", `Cart ${cart.id} item ${item.id} references missing product ${item.productId}.`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      problem("shape", `Cart ${cart.id} item ${item.id}: quantity ${item.quantity} is outside 1–20.`);
    }
    checkMoney(item.unitPrice, `Cart ${cart.id} item ${item.id} unitPrice`);

    if (typeof item.configurationKey !== "string") {
      problem("shape", `Cart ${cart.id} item ${item.id}: configurationKey must be a string.`);
    }
    // The future unique constraint is (cart, product, configuration).
    const key = `${item.productId}::${item.configurationKey ?? ""}`;
    if (lineKeys.has(key)) {
      problem(
        "duplicate",
        `Cart ${cart.id}: two lines share product ${item.productId} and the same configuration.`,
      );
    }
    lineKeys.add(key);
  }
}

for (const wishlist of wishlists) {
  checkOwner(wishlist, "Wishlist");
  const items = Array.isArray(wishlist.items) ? wishlist.items : [];
  if (!Array.isArray(wishlist.items)) problem("shape", `Wishlist ${wishlist.id}: items is not an array.`);

  const itemIds = new Set();
  const seenProducts = new Set();
  for (const item of items) {
    if (itemIds.has(item.id)) {
      problem("duplicate", `Wishlist ${wishlist.id}: duplicate item id "${item.id}".`);
    }
    itemIds.add(item.id);
    if (!productIds.has(item.productId)) {
      problem("orphan", `Wishlist ${wishlist.id} item ${item.id} references missing product ${item.productId}.`);
    }
    if (seenProducts.has(item.productId)) {
      problem("duplicate", `Wishlist ${wishlist.id}: product ${item.productId} saved more than once.`);
    }
    seenProducts.add(item.productId);
  }
}

/* ── orders (Phase 6C — historical records) ─────────────────────── */

const orders = rows("orders");
checkTimestamps(orders, "order");
checkDuplicates(orders, "orders", (o) => o.orderNumber, "order number");
checkDuplicates(
  orders,
  "orders",
  (o) => `${ownerOf(o)}::${o.idempotencyKey}`,
  "user + idempotency key",
);
for (const order of orders) {
  checkOwner(order, "Order");
  if (!ORDER_STATUSES.has(order.status)) {
    problem("shape", `Order ${order.id}: unknown status "${order.status}".`);
  }
  checkMoney(order.subtotal, `Order ${order.id} subtotal`);
  checkMoney(order.shippingAmount, `Order ${order.id} shippingAmount`);
  checkMoney(order.taxAmount, `Order ${order.id} taxAmount`);
  checkMoney(order.discountAmount, `Order ${order.id} discountAmount`);
  checkMoney(order.total, `Order ${order.id} total`);
  if (typeof order.orderNumber !== "string" || !order.orderNumber) {
    problem("shape", `Order ${order.id}: missing orderNumber.`);
  }
  if (!order.shippingAddress?.line1 || !order.customer?.name) {
    problem("shape", `Order ${order.id}: missing customer/address snapshot.`);
  }
  const items = Array.isArray(order.items) ? order.items : [];
  if (!Array.isArray(order.items) || items.length === 0) {
    problem("shape", `Order ${order.id}: has no items.`);
  }
  for (const item of items) {
    checkMoney(item.unitPrice, `Order ${order.id} item ${item.id} unitPrice`);
    checkMoney(item.lineSubtotal, `Order ${order.id} item ${item.id} lineSubtotal`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      problem("shape", `Order ${order.id} item ${item.id}: invalid quantity ${item.quantity}.`);
    }
    if (!item.nameSnapshot) {
      problem("shape", `Order ${order.id} item ${item.id}: missing name snapshot.`);
    }
    // Snapshots make items self-sufficient; a missing product is only a
    // note-worthy orphan, never a blocker for HISTORICAL data.
    if (!productIds.has(item.productId)) {
      problem("orphan", `Order ${order.id} item ${item.id} references missing product ${item.productId}.`);
    }
  }
}

const orderIds = new Set(orders.map((order) => order.id));
const orderActivities = rows("orderActivities");
const orderNotes = rows("orderNotes");
checkIds(orderActivities, "orderActivities");
checkIds(orderNotes, "orderNotes");
checkTimestamps(orderActivities, "orderActivity", { requireUpdated: false });
checkTimestamps(orderNotes, "orderNote", { requireUpdated: false });
for (const activity of orderActivities) {
  if (!orderIds.has(activity.orderId)) problem("orphan", `OrderActivity ${activity.id} references missing order ${activity.orderId}.`);
  if (!["order_created", "status_changed", "order_cancelled", "internal_note_added"].includes(activity.type)) {
    problem("shape", `OrderActivity ${activity.id}: unknown type "${activity.type}".`);
  }
  if (activity.fromStatus && !ORDER_STATUSES.has(activity.fromStatus)) problem("shape", `OrderActivity ${activity.id}: invalid fromStatus.`);
  if (activity.toStatus && !ORDER_STATUSES.has(activity.toStatus)) problem("shape", `OrderActivity ${activity.id}: invalid toStatus.`);
  if (activity.actorUserId && !userIds.has(activity.actorUserId)) problem("orphan", `OrderActivity ${activity.id} references missing actor ${activity.actorUserId}.`);
}
for (const note of orderNotes) {
  if (!orderIds.has(note.orderId)) problem("orphan", `OrderNote ${note.id} references missing order ${note.orderId}.`);
  if (typeof note.authorName !== "string" || !note.authorName.trim()) problem("shape", `OrderNote ${note.id}: authorName is missing.`);
  if (typeof note.body !== "string" || !note.body.trim() || note.body.length > 2000) problem("shape", `OrderNote ${note.id}: body is empty or over 2000 chars.`);
  if (note.authorUserId && !userIds.has(note.authorUserId)) problem("orphan", `OrderNote ${note.id} references missing author ${note.authorUserId}.`);
}

/* ── payments (Phase 10 foundation) ─────────────────────────────── */

const PAYMENT_STATUSES = new Set([
  "unpaid", "pending", "authorized", "paid", "failed", "cancelled", "refunded",
]);
const PAYMENT_PROVIDERS = new Set(["manual", "cash_on_delivery", "online_gateway"]);
const PAYMENT_ATTEMPT_STATUSES = new Set(["pending", "authorized", "paid", "failed", "cancelled"]);

const payments = rows("payments");
checkIds(payments, "payments");
checkTimestamps(payments, "payment");
checkDuplicates(payments, "payments", (p) => p.orderId, "orderId");
for (const payment of payments) {
  if (!orderIds.has(payment.orderId)) {
    problem("orphan", `Payment ${payment.id} references missing order ${payment.orderId}.`);
  }
  if (!PAYMENT_STATUSES.has(payment.status)) {
    problem("shape", `Payment ${payment.id}: unknown status "${payment.status}".`);
  }
  if (!PAYMENT_PROVIDERS.has(payment.provider)) {
    problem("shape", `Payment ${payment.id}: unknown provider "${payment.provider}".`);
  }
  if (!PAYMENT_PROVIDERS.has(payment.method)) {
    problem("shape", `Payment ${payment.id}: unknown method "${payment.method}".`);
  }
  checkMoney(payment.amount, `Payment ${payment.id} amount`);
  const order = orders.find((o) => o.id === payment.orderId);
  if (order && payment.amount && order.total && payment.amount.amount !== order.total.amount) {
    problem(
      "money",
      `Payment ${payment.id}: amount ${payment.amount.amount} does not match order ${order.id} total ${order.total.amount}.`,
    );
  }
}

const paymentIds = new Set(payments.map((p) => p.id));
const paymentAttempts = rows("paymentAttempts");
checkIds(paymentAttempts, "paymentAttempts");
checkTimestamps(paymentAttempts, "paymentAttempt");
checkDuplicates(
  paymentAttempts,
  "paymentAttempts",
  (a) => `${a.paymentId}::${a.idempotencyKey}`,
  "payment + idempotency key",
);
for (const attempt of paymentAttempts) {
  if (!paymentIds.has(attempt.paymentId)) {
    problem("orphan", `PaymentAttempt ${attempt.id} references missing payment ${attempt.paymentId}.`);
  }
  if (!orderIds.has(attempt.orderId)) {
    problem("orphan", `PaymentAttempt ${attempt.id} references missing order ${attempt.orderId}.`);
  }
  if (!PAYMENT_ATTEMPT_STATUSES.has(attempt.status)) {
    problem("shape", `PaymentAttempt ${attempt.id}: unknown status "${attempt.status}".`);
  }
  checkMoney(attempt.amount, `PaymentAttempt ${attempt.id} amount`);
}

const paymentActivities = rows("paymentActivities");
checkIds(paymentActivities, "paymentActivities");
checkTimestamps(paymentActivities, "paymentActivity", { requireUpdated: false });
for (const activity of paymentActivities) {
  if (!paymentIds.has(activity.paymentId)) {
    problem("orphan", `PaymentActivity ${activity.id} references missing payment ${activity.paymentId}.`);
  }
  if (!orderIds.has(activity.orderId)) {
    problem("orphan", `PaymentActivity ${activity.id} references missing order ${activity.orderId}.`);
  }
  if (activity.fromStatus && !PAYMENT_STATUSES.has(activity.fromStatus)) {
    problem("shape", `PaymentActivity ${activity.id}: invalid fromStatus.`);
  }
  if (activity.toStatus && !PAYMENT_STATUSES.has(activity.toStatus)) {
    problem("shape", `PaymentActivity ${activity.id}: invalid toStatus.`);
  }
  if (activity.actorUserId && !userIds.has(activity.actorUserId)) {
    problem("orphan", `PaymentActivity ${activity.id} references missing actor ${activity.actorUserId}.`);
  }
}

const paymentWebhookEvents = rows("paymentWebhookEvents");
checkIds(paymentWebhookEvents, "paymentWebhookEvents");
checkTimestamps(paymentWebhookEvents, "paymentWebhookEvent");
checkDuplicates(
  paymentWebhookEvents,
  "paymentWebhookEvents",
  (e) => `${e.provider}::${e.providerEventId}`,
  "provider + providerEventId",
);
for (const event of paymentWebhookEvents) {
  if (!PAYMENT_PROVIDERS.has(event.provider)) {
    problem("shape", `PaymentWebhookEvent ${event.id}: unknown provider "${event.provider}".`);
  }
  if (event.paymentId && !paymentIds.has(event.paymentId)) {
    problem("orphan", `PaymentWebhookEvent ${event.id} references missing payment ${event.paymentId}.`);
  }
  if (event.orderId && !orderIds.has(event.orderId)) {
    problem("orphan", `PaymentWebhookEvent ${event.id} references missing order ${event.orderId}.`);
  }
}

/* ── shipping & fulfillment (Phase 11 foundation) ───────────────── */

const SHIPMENT_STATUSES = new Set([
  "not_ready", "preparing", "ready_to_ship", "shipped", "out_for_delivery",
  "delivered", "delivery_failed", "returned", "cancelled",
]);
const SHIPMENT_METHODS = new Set(["standard", "local_delivery", "pickup", "provider_managed"]);

const shipments = rows("shipments");
checkIds(shipments, "shipments");
checkTimestamps(shipments, "shipment");
checkDuplicates(shipments, "shipments", (s) => s.orderId, "orderId");
for (const shipment of shipments) {
  if (!orderIds.has(shipment.orderId)) {
    problem("orphan", `Shipment ${shipment.id} references missing order ${shipment.orderId}.`);
  }
  if (!SHIPMENT_STATUSES.has(shipment.status)) {
    problem("shape", `Shipment ${shipment.id}: unknown status "${shipment.status}".`);
  }
  if (!SHIPMENT_METHODS.has(shipment.method)) {
    problem("shape", `Shipment ${shipment.id}: unknown method "${shipment.method}".`);
  }
  if (shipment.carrier !== undefined && (typeof shipment.carrier !== "string" || shipment.carrier.length > 80)) {
    problem("shape", `Shipment ${shipment.id}: carrier is invalid or over 80 chars.`);
  }
  if (
    shipment.trackingNumber !== undefined &&
    (typeof shipment.trackingNumber !== "string" || shipment.trackingNumber.length > 100)
  ) {
    problem("shape", `Shipment ${shipment.id}: trackingNumber is invalid or over 100 chars.`);
  }
  // No delivery address on the shipment — it must always be read from the
  // order's own immutable snapshot (Phase 6C), never duplicated here.
  if ("shippingAddress" in shipment || "address" in shipment) {
    problem("shape", `Shipment ${shipment.id}: must not carry its own address copy.`);
  }
}

const shipmentIds = new Set(shipments.map((s) => s.id));
const shipmentActivities = rows("shipmentActivities");
checkIds(shipmentActivities, "shipmentActivities");
checkTimestamps(shipmentActivities, "shipmentActivity", { requireUpdated: false });
for (const activity of shipmentActivities) {
  if (!shipmentIds.has(activity.shipmentId)) {
    problem("orphan", `ShipmentActivity ${activity.id} references missing shipment ${activity.shipmentId}.`);
  }
  if (!orderIds.has(activity.orderId)) {
    problem("orphan", `ShipmentActivity ${activity.id} references missing order ${activity.orderId}.`);
  }
  if (activity.fromStatus && !SHIPMENT_STATUSES.has(activity.fromStatus)) {
    problem("shape", `ShipmentActivity ${activity.id}: invalid fromStatus.`);
  }
  if (activity.toStatus && !SHIPMENT_STATUSES.has(activity.toStatus)) {
    problem("shape", `ShipmentActivity ${activity.id}: invalid toStatus.`);
  }
  if (activity.actorUserId && !userIds.has(activity.actorUserId)) {
    problem("orphan", `ShipmentActivity ${activity.id} references missing actor ${activity.actorUserId}.`);
  }
}

const shipmentWebhookEvents = rows("shipmentWebhookEvents");
checkIds(shipmentWebhookEvents, "shipmentWebhookEvents");
checkTimestamps(shipmentWebhookEvents, "shipmentWebhookEvent");
checkDuplicates(
  shipmentWebhookEvents,
  "shipmentWebhookEvents",
  (e) => `${e.carrier}::${e.providerEventId}`,
  "carrier + providerEventId",
);
for (const event of shipmentWebhookEvents) {
  if (event.shipmentId && !shipmentIds.has(event.shipmentId)) {
    problem("orphan", `ShipmentWebhookEvent ${event.id} references missing shipment ${event.shipmentId}.`);
  }
  if (event.orderId && !orderIds.has(event.orderId)) {
    problem("orphan", `ShipmentWebhookEvent ${event.id} references missing order ${event.orderId}.`);
  }
}

/* ── customization requests (Phase 7B foundation) ───────────────── */

const customizationRequests = rows("customizationRequests");
checkIds(customizationRequests, "customizationRequests");
checkTimestamps(customizationRequests, "customizationRequest");
const measurementIds = new Set(measurements.map((m) => m.id));
for (const request of customizationRequests) {
  checkOwner(request, "CustomizationRequest");
  if (!CUSTOMIZATION_STATUSES.has(request.status)) {
    problem("shape", `CustomizationRequest ${request.id}: unknown status "${request.status}".`);
  }
  if (typeof request.details !== "string" || !request.details || request.details.length > 1000) {
    problem("shape", `CustomizationRequest ${request.id}: details missing or over 1000 chars.`);
  }
  // FK targets must exist or the Postgres import will refuse the row.
  if (request.productId !== undefined && !productIds.has(request.productId)) {
    problem("orphan", `CustomizationRequest ${request.id} references missing product ${request.productId}.`);
  }
  if (
    request.measurementProfileId !== undefined &&
    !measurementIds.has(request.measurementProfileId)
  ) {
    problem("orphan", `CustomizationRequest ${request.id} references missing measurement profile ${request.measurementProfileId}.`);
  }
  if (request.orderId && !orderIds.has(request.orderId)) problem("orphan", `CustomizationRequest ${request.id} references missing order ${request.orderId}.`);
}

const customizationIds = new Set(customizationRequests.map((request) => request.id));
for (const activity of rows("customizationActivities")) {
  if (!customizationIds.has(activity.customizationRequestId)) problem("orphan", `CustomizationActivity ${activity.id} references missing request.`);
  if (!CUSTOMIZATION_STATUSES.has(activity.fromStatus) && activity.fromStatus) problem("shape", `CustomizationActivity ${activity.id}: invalid fromStatus.`);
  if (!CUSTOMIZATION_STATUSES.has(activity.toStatus) && activity.toStatus) problem("shape", `CustomizationActivity ${activity.id}: invalid toStatus.`);
}
for (const note of rows("customizationNotes")) {
  if (!customizationIds.has(note.customizationRequestId)) problem("orphan", `CustomizationNote ${note.id} references missing request.`);
  if (typeof note.body !== "string" || !note.body.trim() || note.body.length > 2000) problem("shape", `CustomizationNote ${note.id}: body is empty or over 2000 chars.`);
}

/* ── report ─────────────────────────────────────────────────────── */

const counts = Object.fromEntries(COLLECTIONS.map((key) => [key, rows(key).length]));
const embedded = {
  customerAddresses: profiles.reduce((n, p) => n + (p.addresses?.length ?? 0), 0),
  measurementValues: measurements.reduce((n, m) => n + (m.values?.length ?? 0), 0),
  productMedia: products.reduce((n, p) => n + (p.media?.length ?? 0), 0),
  productCollectionLinks: products.reduce((n, p) => n + (p.collectionIds?.length ?? 0), 0),
  productSecondaryCategoryLinks: products.reduce((n, p) => n + (p.secondaryCategoryIds?.length ?? 0), 0),
  cartItems: carts.reduce((n, c) => n + (c.items?.length ?? 0), 0),
  wishlistItems: wishlists.reduce((n, w) => n + (w.items?.length ?? 0), 0),
  orderItems: orders.reduce((n, o) => n + (o.items?.length ?? 0), 0),
};

// Every owned row counts, not just carts and wishlists — a customer with
// saved measurements but an empty cart is the ordinary case here.
const ownedRows = [...carts, ...wishlists, ...measurements];
const ownershipField = ownedRows.length === 0
  ? "n/a (no owned rows)"
  : ownedRows.every((r) => r.userId !== undefined)
    ? "userId"
    : ownedRows.every((r) => r.userId === undefined)
      ? "customerId (pre-v4)"
      : "MIXED — partially migrated";
if (ownershipField === "MIXED — partially migrated") {
  problem("ownership", "Some owned rows use userId and others still use customerId — the v4 migration did not complete.");
}

const byKind = problems.reduce((acc, p) => {
  acc[p.kind] = (acc[p.kind] ?? 0) + 1;
  return acc;
}, {});

if (asJson) {
  console.log(
    JSON.stringify(
      { ok: problems.length === 0, storePath, version: store.version, counts, embedded, ownershipField, problems, notes },
      null,
      2,
    ),
  );
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n  Migration-readiness report`);
  console.log(`  ${storePath}`);
  console.log(`  store version ${store.version}  ·  ownership field: ${ownershipField}\n`);

  console.log("  ENTITY COUNTS");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`    ${pad(key, 24)} ${String(value).padStart(5)}`);
  }
  console.log("\n  EMBEDDED ROWS (become their own tables)");
  for (const [key, value] of Object.entries(embedded)) {
    console.log(`    ${pad(key, 32)} ${String(value).padStart(5)}`);
  }

  if (notes.length) {
    console.log("\n  NOTES");
    for (const message of notes) console.log(`    - ${message}`);
  }

  if (problems.length === 0) {
    console.log("\n  RESULT: READY — no blocking problems found.\n");
  } else {
    console.log(`\n  PROBLEMS (${problems.length})`);
    for (const [kind, count] of Object.entries(byKind)) {
      console.log(`    ${pad(kind, 14)} ${count}`);
    }
    console.log("");
    for (const p of problems) console.log(`    [${p.kind}] ${p.message}`);
    console.log("\n  RESULT: NOT READY — fix the problems above before migrating.");
    console.log("  Nothing was modified; this script never writes.\n");
  }
}

process.exit(problems.length === 0 ? 0 : 1);
