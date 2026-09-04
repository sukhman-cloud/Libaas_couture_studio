import "server-only";
import { Prisma } from "@prisma/client";
import type {
  AuthCredential,
  Cart,
  CartItem,
  Category,
  Collection,
  CustomerAddress,
  CustomerProfile,
  CustomizationRequest,
  CustomizationActivity,
  CustomizationNote,
  MeasurementProfile,
  MediaAsset,
  Order,
  OrderActivity,
  OrderItem,
  OrderNote,
  PasswordResetToken,
  Payment,
  PaymentActivity,
  PaymentAttempt,
  PaymentWebhookEvent,
  Product,
  ProductAttributes,
  ProductMedia,
  Shipment,
  ShipmentActivity,
  ShipmentWebhookEvent,
  User,
  Wishlist,
  WishlistItem,
} from "@/types/domain";

/**
 * Row ↔ domain mapping for the PostgreSQL provider.
 *
 * The domain uses ISO-8601 strings for dates, integer-paise `Money`
 * objects, and OMITS optional keys rather than carrying nulls (that is
 * what the JSON store produced, and what every parity test compares
 * against). These mappers are the single place those conventions are
 * translated, in both directions:
 *
 *   DateTime  ↔  ISO string          (millisecond-exact round trip)
 *   BIGINT    ↔  number              (paise are far below 2^53; guarded)
 *   NULL      ↔  absent key
 *   child rows ordered by `position` ↔ embedded arrays
 */

/* ── scalar helpers ─────────────────────────────────────────────── */

const iso = (value: Date): string => value.toISOString();

/** BIGINT paise → number, guarded so an overflow can never pass silently. */
export function moneyAmount(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Money amount out of safe integer range: ${value}`);
  }
  return amount;
}

/** Spread helper: include `key` only when the value is present. */
function opt<K extends string, V>(
  key: K,
  value: V | null | undefined,
): { [P in K]?: V } {
  return value === null || value === undefined
    ? {}
    : ({ [key]: value } as { [P in K]: V });
}

/** Like `opt` for dates, converting to ISO on the way out. */
function optDate<K extends string>(
  key: K,
  value: Date | null | undefined,
): { [P in K]?: string } {
  return value === null || value === undefined
    ? {}
    : ({ [key]: iso(value) } as { [P in K]: string });
}

/* ── row types (Prisma payloads with the includes each mapper needs) ─ */

export type ProductRow = Prisma.ProductGetPayload<{
  include: {
    secondaryCategories: true;
    collections: true;
    media: true;
  };
}>;

export type ProfileRow = Prisma.CustomerProfileGetPayload<{
  include: { addresses: true };
}>;

export type MeasurementRow = Prisma.MeasurementProfileGetPayload<{
  include: { values: true };
}>;

export type CartRow = Prisma.CartGetPayload<{ include: { items: true } }>;
export type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;
export type WishlistRow = Prisma.WishlistGetPayload<{
  include: { items: true };
}>;

/** The include clauses matching the row types above — pass to findMany. */
export const PRODUCT_INCLUDE = {
  secondaryCategories: { orderBy: { position: "asc" } },
  collections: { orderBy: { position: "asc" } },
  media: { orderBy: { position: "asc" } },
} satisfies Prisma.ProductInclude;

export const PROFILE_INCLUDE = {
  addresses: { orderBy: { position: "asc" } },
} satisfies Prisma.CustomerProfileInclude;

export const MEASUREMENT_INCLUDE = {
  values: { orderBy: { position: "asc" } },
} satisfies Prisma.MeasurementProfileInclude;

export const CART_INCLUDE = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.CartInclude;

export const ORDER_INCLUDE = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.OrderInclude;

export function toOrderActivity(
  row: Prisma.OrderActivityGetPayload<object>,
): OrderActivity {
  return {
    id: row.id,
    orderId: row.orderId,
    type: row.type as OrderActivity["type"],
    ...opt("actorUserId", row.actorUserId),
    ...opt("fromStatus", row.fromStatus),
    ...opt("toStatus", row.toStatus),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as OrderActivity["metadata"] }),
    createdAt: iso(row.createdAt),
  };
}

export function toOrderNote(
  row: Prisma.OrderNoteGetPayload<object>,
): OrderNote {
  return {
    id: row.id,
    orderId: row.orderId,
    ...opt("authorUserId", row.authorUserId),
    authorName: row.authorName,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}

export const WISHLIST_INCLUDE = {
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.WishlistInclude;

/* ── identity ───────────────────────────────────────────────────── */

export function toUser(row: Prisma.UserGetPayload<object>): User {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    ...opt("email", row.email),
    ...opt("phone", row.phone),
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCredential(
  row: Prisma.AuthCredentialGetPayload<object>,
): AuthCredential {
  return {
    id: row.id,
    userId: row.userId,
    passwordHash: row.passwordHash,
    sessionVersion: row.sessionVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toResetToken(
  row: Prisma.PasswordResetTokenGetPayload<object>,
): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: iso(row.expiresAt),
    ...optDate("usedAt", row.usedAt),
    createdAt: iso(row.createdAt),
  };
}

/* ── customer ───────────────────────────────────────────────────── */

function toAddress(
  row: Prisma.CustomerAddressGetPayload<object>,
): CustomerAddress {
  return {
    id: row.id,
    label: row.label,
    fullName: row.fullName,
    phone: row.phone,
    line1: row.line1,
    ...opt("line2", row.line2),
    ...opt("locality", row.locality),
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
  };
}

export function toCustomerProfile(row: ProfileRow): CustomerProfile {
  return {
    id: row.id,
    userId: row.userId,
    ...opt("defaultAddressId", row.defaultAddressId),
    addresses: row.addresses.map(toAddress),
    acceptsMarketing: row.acceptsMarketing,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toMeasurementProfile(row: MeasurementRow): MeasurementProfile {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    unit: row.unit,
    values: row.values.map((v) => ({ key: v.key, value: v.value })),
    ...opt("fitPreference", row.fitPreference),
    ...opt("notes", row.notes),
    isDefault: row.isDefault,
    ...optDate("archivedAt", row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/* ── customization requests (Phase 7B) ──────────────────────────── */

export function toCustomizationRequest(
  row: Prisma.CustomizationRequestGetPayload<object>,
): CustomizationRequest {
  return {
    id: row.id,
    userId: row.userId,
    ...opt("productId", row.productId),
    ...opt("measurementProfileId", row.measurementProfileId),
    ...opt("orderId", row.orderId),
    ...opt("orderItemId", row.orderItemId),
    details: row.details,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function customizationRequestColumns(request: CustomizationRequest) {
  return {
    id: request.id,
    userId: request.userId,
    productId: request.productId ?? null,
    measurementProfileId: request.measurementProfileId ?? null,
    orderId: request.orderId ?? null,
    orderItemId: request.orderItemId ?? null,
    details: request.details,
    status: request.status,
    createdAt: new Date(request.createdAt),
    updatedAt: new Date(request.updatedAt),
  };
}

export function toCustomizationActivity(row: Prisma.CustomizationActivityGetPayload<object>): CustomizationActivity {
  return {
    id: row.id,
    customizationRequestId: row.customizationRequestId,
    type: row.type as CustomizationActivity["type"],
    ...opt("actorUserId", row.actorUserId),
    ...opt("fromStatus", row.fromStatus),
    ...opt("toStatus", row.toStatus),
    createdAt: iso(row.createdAt),
  };
}

export function toCustomizationNote(row: Prisma.CustomizationNoteGetPayload<object>): CustomizationNote {
  return {
    id: row.id,
    customizationRequestId: row.customizationRequestId,
    ...opt("authorUserId", row.authorUserId),
    authorName: row.authorName,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}

/* ── catalog ────────────────────────────────────────────────────── */

export function toMediaAsset(
  row: Prisma.MediaAssetGetPayload<object>,
): MediaAsset {
  return {
    id: row.id,
    storageKey: row.storageKey,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: iso(row.createdAt),
  };
}

export function toCategory(row: Prisma.CategoryGetPayload<object>): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...opt("description", row.description),
    ...opt("parentId", row.parentId),
    ...opt("mediaId", row.mediaId),
    sortOrder: row.sortOrder,
    status: row.status,
    ...optDate("archivedAt", row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCollection(
  row: Prisma.CollectionGetPayload<object>,
): Collection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...opt("description", row.description),
    ...opt("coverMediaId", row.coverMediaId),
    sortOrder: row.sortOrder,
    status: row.status,
    ...optDate("archivedAt", row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toProductMedia(
  row: Prisma.ProductMediaGetPayload<object>,
): ProductMedia {
  return {
    id: row.id,
    mediaId: row.mediaId,
    alt: row.alt,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    createdAt: iso(row.createdAt),
  };
}

function toAttributes(row: ProductRow): ProductAttributes {
  return {
    ...opt("fabric", row.fabric),
    ...opt("colour", row.colour),
    ...opt("occasion", row.occasion),
    ...opt("work", row.work),
    ...opt("fit", row.fit),
    ...opt(
      "extra",
      row.attributesExtra === null
        ? undefined
        : (row.attributesExtra as Record<string, string>),
    ),
  };
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    ...opt("shortDescription", row.shortDescription),
    description: row.description,
    ...opt("categoryId", row.categoryId),
    secondaryCategoryIds: row.secondaryCategories.map((s) => s.categoryId),
    collectionIds: row.collections.map((c) => c.collectionId),
    tags: row.tags,
    price: {
      amount: moneyAmount(row.priceAmount),
      currency: row.priceCurrency as Product["price"]["currency"],
    },
    ...(row.salePriceAmount === null
      ? {}
      : {
          salePrice: {
            amount: moneyAmount(row.salePriceAmount),
            currency: (row.salePriceCurrency ??
              "INR") as Product["price"]["currency"],
          },
        }),
    status: row.status,
    availability: row.availability,
    isFeatured: row.isFeatured,
    attributes: toAttributes(row),
    stitchingAvailable: row.stitchingAvailable,
    customizationAvailable: row.customizationAvailable,
    media: row.media.map(toProductMedia),
    ...optDate("archivedAt", row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/* ── shopping ───────────────────────────────────────────────────── */

function toCartItem(row: Prisma.CartItemGetPayload<object>): CartItem {
  return {
    id: row.id,
    productId: row.productId,
    quantity: row.quantity,
    unitPrice: {
      amount: moneyAmount(row.unitPriceAmount),
      currency: row.unitPriceCurrency as CartItem["unitPrice"]["currency"],
    },
    configurationKey: row.configurationKey,
    ...(row.stitching === null
      ? {}
      : { stitching: row.stitching as CartItem["stitching"] }),
    ...opt("customizationRequestId", row.customizationRequestId),
    ...opt("notes", row.notes),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCart(row: CartRow): Cart {
  return {
    id: row.id,
    userId: row.userId,
    items: row.items.map(toCartItem),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toWishlistItem(
  row: Prisma.WishlistItemGetPayload<object>,
): WishlistItem {
  return {
    id: row.id,
    productId: row.productId,
    createdAt: iso(row.createdAt),
  };
}

export function toWishlist(row: WishlistRow): Wishlist {
  return {
    id: row.id,
    userId: row.userId,
    items: row.items.map(toWishlistItem),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/* ── orders (Phase 6C) ──────────────────────────────────────────── */

function toOrderItem(row: Prisma.OrderItemGetPayload<object>): OrderItem {
  return {
    id: row.id,
    productId: row.productId,
    nameSnapshot: row.nameSnapshot,
    slugSnapshot: row.slugSnapshot,
    quantity: row.quantity,
    unitPrice: {
      amount: moneyAmount(row.unitPriceAmount),
      currency: row.currency as OrderItem["unitPrice"]["currency"],
    },
    lineSubtotal: {
      amount: moneyAmount(row.lineSubtotalAmount),
      currency: row.currency as OrderItem["unitPrice"]["currency"],
    },
    configurationKey: row.configurationKey,
    ...(row.stitching === null
      ? {}
      : // JSONB carries the nested measurement snapshot (Phase 7B); the
        // shape is produced exclusively by the order service, so the
        // unknown-bridge is a serialization cast, not a validation skip.
        { stitching: row.stitching as unknown as OrderItem["stitching"] }),
    ...opt("customizationRequestId", row.customizationRequestId),
    ...opt("notes", row.notes),
  };
}

export function toOrder(row: OrderRow): Order {
  const currency = row.currency as Order["currency"];
  const money = (amount: bigint) => ({ amount: moneyAmount(amount), currency });
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    userId: row.userId,
    status: row.status,
    customer: {
      name: row.customerName,
      ...opt("email", row.customerEmail),
      ...opt("phone", row.customerPhone),
    },
    shippingAddress: {
      fullName: row.shipFullName,
      phone: row.shipPhone,
      line1: row.shipLine1,
      ...opt("line2", row.shipLine2),
      ...opt("locality", row.shipLocality),
      city: row.shipCity,
      state: row.shipState,
      postalCode: row.shipPostalCode,
      country: row.shipCountry,
    },
    items: row.items.map(toOrderItem),
    currency,
    subtotal: money(row.subtotalAmount),
    shippingAmount: money(row.shippingAmount),
    taxAmount: money(row.taxAmount),
    discountAmount: money(row.discountAmount),
    total: money(row.totalAmount),
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function orderColumns(order: Order) {
  return {
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    currency: order.currency,
    subtotalAmount: BigInt(order.subtotal.amount),
    shippingAmount: BigInt(order.shippingAmount.amount),
    taxAmount: BigInt(order.taxAmount.amount),
    discountAmount: BigInt(order.discountAmount.amount),
    totalAmount: BigInt(order.total.amount),
    customerName: order.customer.name,
    customerEmail: order.customer.email ?? null,
    customerPhone: order.customer.phone ?? null,
    shipFullName: order.shippingAddress.fullName,
    shipPhone: order.shippingAddress.phone,
    shipLine1: order.shippingAddress.line1,
    shipLine2: order.shippingAddress.line2 ?? null,
    shipLocality: order.shippingAddress.locality ?? null,
    shipCity: order.shippingAddress.city,
    shipState: order.shippingAddress.state,
    shipPostalCode: order.shippingAddress.postalCode,
    shipCountry: order.shippingAddress.country,
    idempotencyKey: order.idempotencyKey,
    requestFingerprint: order.requestFingerprint,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  };
}

/** `stitching` JSONB: undefined stays OUT of the row (SQL NULL). */
export function orderItemRows(order: Order) {
  return order.items.map((item, position) => ({
    id: item.id,
    orderId: order.id,
    productId: item.productId,
    nameSnapshot: item.nameSnapshot,
    slugSnapshot: item.slugSnapshot,
    quantity: item.quantity,
    unitPriceAmount: BigInt(item.unitPrice.amount),
    lineSubtotalAmount: BigInt(item.lineSubtotal.amount),
    currency: item.unitPrice.currency,
    configurationKey: item.configurationKey,
    ...(item.stitching === undefined
      ? {}
      : // Serialized verbatim as JSONB (incl. the nested Phase 7B
        // measurement snapshot); the object is plain data by construction.
        { stitching: item.stitching as unknown as Prisma.InputJsonValue }),
    customizationRequestId: item.customizationRequestId ?? null,
    notes: item.notes ?? null,
    position,
  }));
}

/* ── write payload helpers (domain → columns) ───────────────────── */

export function userColumns(user: User) {
  return {
    kind: user.kind,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    isActive: user.isActive,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

export function credentialColumns(credential: AuthCredential) {
  return {
    userId: credential.userId,
    passwordHash: credential.passwordHash,
    sessionVersion: credential.sessionVersion,
    createdAt: new Date(credential.createdAt),
    updatedAt: new Date(credential.updatedAt),
  };
}

export function resetTokenColumns(token: PasswordResetToken) {
  return {
    userId: token.userId,
    tokenHash: token.tokenHash,
    expiresAt: new Date(token.expiresAt),
    usedAt: token.usedAt ? new Date(token.usedAt) : null,
    createdAt: new Date(token.createdAt),
  };
}

/** Profile scalar columns — addresses and the default pointer are written
 *  separately by the provider (see the ordering note there). */
export function profileColumns(profile: CustomerProfile) {
  return {
    userId: profile.userId,
    acceptsMarketing: profile.acceptsMarketing,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  };
}

export function addressRows(profile: CustomerProfile) {
  return profile.addresses.map((address, position) => ({
    id: address.id,
    profileId: profile.id,
    position,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    locality: address.locality ?? null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  }));
}

export function measurementColumns(profile: MeasurementProfile) {
  return {
    userId: profile.userId,
    label: profile.label,
    unit: profile.unit,
    fitPreference: profile.fitPreference ?? null,
    notes: profile.notes ?? null,
    isDefault: profile.isDefault,
    archivedAt: profile.archivedAt ? new Date(profile.archivedAt) : null,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
  };
}

export function measurementValueRows(profile: MeasurementProfile) {
  return profile.values.map((value, position) => ({
    profileId: profile.id,
    key: value.key,
    value: value.value,
    position,
  }));
}

export function mediaAssetColumns(asset: MediaAsset) {
  return {
    storageKey: asset.storageKey,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: new Date(asset.createdAt),
  };
}

export function categoryColumns(category: Category) {
  return {
    slug: category.slug,
    name: category.name,
    description: category.description ?? null,
    parentId: category.parentId ?? null,
    mediaId: category.mediaId ?? null,
    sortOrder: category.sortOrder,
    status: category.status,
    archivedAt: category.archivedAt ? new Date(category.archivedAt) : null,
    createdAt: new Date(category.createdAt),
    updatedAt: new Date(category.updatedAt),
  };
}

export function collectionColumns(collection: Collection) {
  return {
    slug: collection.slug,
    name: collection.name,
    description: collection.description ?? null,
    coverMediaId: collection.coverMediaId ?? null,
    sortOrder: collection.sortOrder,
    status: collection.status,
    archivedAt: collection.archivedAt ? new Date(collection.archivedAt) : null,
    createdAt: new Date(collection.createdAt),
    updatedAt: new Date(collection.updatedAt),
  };
}

/** Product scalar columns; child rows are produced by the helpers below.
 *  `DbNull` for a cleared extra-attributes map must be supplied by the
 *  provider (it owns the Prisma namespace import). */
export function productColumns(product: Product) {
  return {
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription ?? null,
    description: product.description,
    categoryId: product.categoryId ?? null,
    priceAmount: BigInt(product.price.amount),
    priceCurrency: product.price.currency,
    salePriceAmount:
      product.salePrice === undefined ? null : BigInt(product.salePrice.amount),
    salePriceCurrency: product.salePrice?.currency ?? null,
    status: product.status,
    availability: product.availability,
    isFeatured: product.isFeatured,
    fabric: product.attributes.fabric ?? null,
    colour: product.attributes.colour ?? null,
    occasion: product.attributes.occasion ?? null,
    work: product.attributes.work ?? null,
    fit: product.attributes.fit ?? null,
    tags: product.tags,
    stitchingAvailable: product.stitchingAvailable,
    customizationAvailable: product.customizationAvailable,
    archivedAt: product.archivedAt ? new Date(product.archivedAt) : null,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

export function secondaryCategoryRows(product: Product) {
  return product.secondaryCategoryIds.map((categoryId, position) => ({
    productId: product.id,
    categoryId,
    position,
  }));
}

export function collectionLinkRows(product: Product) {
  return product.collectionIds.map((collectionId, position) => ({
    productId: product.id,
    collectionId,
    position,
  }));
}

export function productMediaRows(product: Product) {
  return product.media.map((media, position) => ({
    id: media.id,
    productId: product.id,
    mediaId: media.mediaId,
    alt: media.alt,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
    position,
    createdAt: new Date(media.createdAt),
  }));
}

export function cartColumns(cart: Cart) {
  return {
    userId: cart.userId,
    createdAt: new Date(cart.createdAt),
    updatedAt: new Date(cart.updatedAt),
  };
}

/** `stitching` JSONB: undefined must stay OUT of the row (SQL NULL). The
 *  provider substitutes DbNull where required on update paths. */
export function cartItemRows(cart: Cart) {
  return cart.items.map((item, position) => ({
    id: item.id,
    cartId: cart.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPriceAmount: BigInt(item.unitPrice.amount),
    unitPriceCurrency: item.unitPrice.currency,
    configurationKey: item.configurationKey,
    ...(item.stitching === undefined ? {} : { stitching: item.stitching }),
    customizationRequestId: item.customizationRequestId ?? null,
    notes: item.notes ?? null,
    position,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }));
}

export function wishlistColumns(wishlist: Wishlist) {
  return {
    userId: wishlist.userId,
    createdAt: new Date(wishlist.createdAt),
    updatedAt: new Date(wishlist.updatedAt),
  };
}

export function wishlistItemRows(wishlist: Wishlist) {
  return wishlist.items.map((item, position) => ({
    id: item.id,
    wishlistId: wishlist.id,
    productId: item.productId,
    position,
    createdAt: new Date(item.createdAt),
  }));
}

/* ── payments (Phase 10) ────────────────────────────────────────── */

export function toPayment(row: Prisma.PaymentGetPayload<object>): Payment {
  const currency = row.currency as Payment["currency"];
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider,
    ...opt("providerPaymentId", row.providerPaymentId),
    amount: { amount: moneyAmount(row.amount), currency },
    currency,
    method: row.method,
    status: row.status,
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as Payment["metadata"] }),
    ...opt("failureCode", row.failureCode),
    ...opt("failureMessage", row.failureMessage),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function paymentColumns(payment: Payment) {
  return {
    orderId: payment.orderId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId ?? null,
    amount: BigInt(payment.amount.amount),
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    metadata: payment.metadata ?? Prisma.DbNull,
    failureCode: payment.failureCode ?? null,
    failureMessage: payment.failureMessage ?? null,
    createdAt: new Date(payment.createdAt),
    updatedAt: new Date(payment.updatedAt),
  };
}

export function toPaymentAttempt(
  row: Prisma.PaymentAttemptGetPayload<object>,
): PaymentAttempt {
  const currency = row.currency as PaymentAttempt["currency"];
  return {
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    provider: row.provider,
    ...opt("providerReference", row.providerReference),
    amount: { amount: moneyAmount(row.amount), currency },
    currency,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    ...opt("failureCode", row.failureCode),
    ...opt("failureMessage", row.failureMessage),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as PaymentAttempt["metadata"] }),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function paymentAttemptColumns(attempt: PaymentAttempt) {
  return {
    paymentId: attempt.paymentId,
    orderId: attempt.orderId,
    provider: attempt.provider,
    providerReference: attempt.providerReference ?? null,
    amount: BigInt(attempt.amount.amount),
    currency: attempt.currency,
    status: attempt.status,
    idempotencyKey: attempt.idempotencyKey,
    failureCode: attempt.failureCode ?? null,
    failureMessage: attempt.failureMessage ?? null,
    metadata: attempt.metadata ?? Prisma.DbNull,
    createdAt: new Date(attempt.createdAt),
    updatedAt: new Date(attempt.updatedAt),
  };
}

export function toPaymentActivity(
  row: Prisma.PaymentActivityGetPayload<object>,
): PaymentActivity {
  return {
    id: row.id,
    paymentId: row.paymentId,
    orderId: row.orderId,
    type: row.type as PaymentActivity["type"],
    ...opt("actorUserId", row.actorUserId),
    ...opt("fromStatus", row.fromStatus),
    ...opt("toStatus", row.toStatus),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as PaymentActivity["metadata"] }),
    createdAt: iso(row.createdAt),
  };
}

export function toPaymentWebhookEvent(
  row: Prisma.PaymentWebhookEventGetPayload<object>,
): PaymentWebhookEvent {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    ...opt("paymentId", row.paymentId),
    ...opt("orderId", row.orderId),
    eventType: row.eventType,
    ...optDate("processedAt", row.processedAt),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as PaymentWebhookEvent["metadata"] }),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/* ── shipping (Phase 11) ────────────────────────────────────────── */

export function toShipment(row: Prisma.ShipmentGetPayload<object>): Shipment {
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    method: row.method,
    ...opt("carrier", row.carrier),
    ...opt("trackingNumber", row.trackingNumber),
    ...opt("estimatedDelivery", row.estimatedDelivery),
    ...optDate("shippedAt", row.shippedAt),
    ...optDate("deliveredAt", row.deliveredAt),
    ...optDate("cancelledAt", row.cancelledAt),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as Shipment["metadata"] }),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function shipmentColumns(shipment: Shipment) {
  return {
    orderId: shipment.orderId,
    status: shipment.status,
    method: shipment.method,
    carrier: shipment.carrier ?? null,
    trackingNumber: shipment.trackingNumber ?? null,
    estimatedDelivery: shipment.estimatedDelivery ?? null,
    shippedAt: shipment.shippedAt ? new Date(shipment.shippedAt) : null,
    deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
    cancelledAt: shipment.cancelledAt ? new Date(shipment.cancelledAt) : null,
    metadata: shipment.metadata ?? Prisma.DbNull,
    createdAt: new Date(shipment.createdAt),
    updatedAt: new Date(shipment.updatedAt),
  };
}

export function toShipmentActivity(
  row: Prisma.ShipmentActivityGetPayload<object>,
): ShipmentActivity {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    orderId: row.orderId,
    type: row.type as ShipmentActivity["type"],
    ...opt("actorUserId", row.actorUserId),
    ...opt("fromStatus", row.fromStatus),
    ...opt("toStatus", row.toStatus),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as ShipmentActivity["metadata"] }),
    createdAt: iso(row.createdAt),
  };
}

export function toShipmentWebhookEvent(
  row: Prisma.ShipmentWebhookEventGetPayload<object>,
): ShipmentWebhookEvent {
  return {
    id: row.id,
    carrier: row.carrier,
    providerEventId: row.providerEventId,
    ...opt("shipmentId", row.shipmentId),
    ...opt("orderId", row.orderId),
    eventType: row.eventType,
    ...optDate("processedAt", row.processedAt),
    ...(row.metadata === null
      ? {}
      : { metadata: row.metadata as ShipmentWebhookEvent["metadata"] }),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
