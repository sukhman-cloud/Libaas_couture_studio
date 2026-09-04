/**
 * Domain model — Libaas Couture Studio.
 *
 * Phase 1: TypeScript contracts only. These types define the shape of the
 * business so later phases (database, APIs, UIs) share one vocabulary.
 * No fake data is created here.
 *
 * Monetary amounts are integers in paise (₹1 = 100 paise).
 * Dates are ISO-8601 strings so entities stay serializable across
 * server/client boundaries.
 *
 * OWNERSHIP RULE
 * Customer-owned records reference the owning **User** by `userId`, never
 * `CustomerProfile.id`. Every authorization check compares against
 * `getCustomerUser().id`, which is a User id, so User is the ownership
 * anchor. CustomerProfile is a satellite of User holding addresses and
 * preferences; only `CustomerProfile.addresses` hangs off the profile.
 * (Store v4 renamed these fields from `customerId`, which held a User id
 * despite its name.)
 */

// ── Shared ──────────────────────────────────────────────────────────

export type ID = string;
export type ISODateTime = string;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Money {
  /** Integer amount in paise. */
  amount: number;
  currency: "INR";
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// ── Users, roles & permissions ──────────────────────────────────────

export type UserKind = "customer" | "admin";

export interface User extends Timestamps {
  id: ID;
  kind: UserKind;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
}

/**
 * Authentication credential — deliberately separate from User so identity,
 * profile and secrets never live in one record.
 */
export interface AuthCredential extends Timestamps {
  id: ID;
  userId: ID;
  /** scrypt hash string (algorithm$params$salt$hash) — never plaintext. */
  passwordHash: string;
  /**
   * Bumped whenever credentials change (password reset/change, deactivate).
   * Sessions embed the version they were minted with; a mismatch
   * invalidates every previously issued session.
   */
  sessionVersion: number;
}

/** One-time password-reset token; only the SHA-256 hash is stored. */
export interface PasswordResetToken {
  id: ID;
  userId: ID;
  tokenHash: string;
  expiresAt: ISODateTime;
  usedAt?: ISODateTime;
  createdAt: ISODateTime;
}

export type AddressLabel = "home" | "work" | "other";

/** A customer's saved delivery/contact address. */
export interface CustomerAddress extends Address {
  id: ID;
  label: AddressLabel;
  fullName: string;
  phone: string;
  /** Locality / area within the city. */
  locality?: string;
}

export interface CustomerProfile extends Timestamps {
  id: ID;
  userId: ID;
  defaultAddressId?: ID;
  addresses: CustomerAddress[];
  /** Marketing / notification preferences. */
  acceptsMarketing: boolean;
}

export type RoleName = "owner" | "manager" | "tailor" | "staff";

export type Permission =
  | "orders.read"
  | "orders.write"
  | "products.read"
  | "products.write"
  | "inventory.read"
  | "inventory.write"
  | "customers.read"
  | "customers.write"
  | "appointments.read"
  | "appointments.write"
  | "payments.read"
  | "payments.write"
  | "shipping.read"
  | "shipping.write"
  | "staff.manage"
  | "settings.manage"
  | "content.manage"
  | "analytics.read"
  | "audit.read";

export interface Role {
  id: ID;
  name: RoleName;
  permissions: Permission[];
}

export interface AdminUser extends Timestamps {
  id: ID;
  userId: ID;
  roleId: ID;
}

// ── Catalog ─────────────────────────────────────────────────────────

/**
 * Publication lifecycle, shared by products, categories and collections.
 * Deliberately separate from availability (see ProductAvailability): a
 * product can be `published` yet `out_of_stock`, or `draft` yet available.
 *
 * `archived` is a soft delete — the record stays for historical references
 * (future orders) but never appears in active catalog queries.
 */
export type CatalogStatus = "draft" | "published" | "archived";

/**
 * An uploaded media file. Storage is abstracted (see server/storage), so
 * `storageKey` is opaque — local disk today, object storage later. Products
 * reference assets through ProductMedia rather than embedding paths.
 */
export interface MediaAsset {
  id: ID;
  /** Opaque key for the storage provider — never a user-supplied path. */
  storageKey: string;
  /** Original upload name, kept for display only (never used as a path). */
  originalName: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  createdAt: ISODateTime;
}

/** A media asset attached to a product, with ordering and alt text. */
export interface ProductMedia {
  id: ID;
  mediaId: ID;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: ISODateTime;
}

export interface Category extends Timestamps {
  id: ID;
  slug: string;
  name: string;
  description?: string;
  /** Future-ready hierarchy; the admin UI keeps it optional and flat-first. */
  parentId?: ID;
  mediaId?: ID;
  sortOrder: number;
  status: CatalogStatus;
  archivedAt?: ISODateTime;
}

/**
 * A thematic/seasonal grouping — distinct from Category (what a product
 * *is*). Membership lives on the product (`collectionIds`) so a product can
 * belong to many collections.
 */
export interface Collection extends Timestamps {
  id: ID;
  slug: string;
  name: string;
  description?: string;
  coverMediaId?: ID;
  sortOrder: number;
  status: CatalogStatus;
  archivedAt?: ISODateTime;
}

/** Stock/fulfilment state — independent of publication status. */
export type ProductAvailability =
  | "available"
  | "made_to_order"
  | "out_of_stock"
  | "discontinued";

/**
 * Boutique attributes. Every field is optional because different garments
 * carry different attributes, and `extra` keeps the model extensible
 * without a schema change.
 */
export interface ProductAttributes {
  fabric?: string;
  colour?: string;
  occasion?: string;
  work?: string;
  fit?: string;
  extra?: Record<string, string>;
}

export interface Product extends Timestamps {
  id: ID;
  /** Unique, uppercase, admin-editable. */
  sku: string;
  /** Unique, URL-safe; the future customer route is /products/<slug>. */
  slug: string;
  name: string;
  shortDescription?: string;
  description: string;

  /** Primary classification. */
  categoryId?: ID;
  /** Optional additional categories (future-ready, not required). */
  secondaryCategoryIds: ID[];
  /** Many-to-many collection membership. */
  collectionIds: ID[];
  tags: string[];

  price: Money;
  /** Optional promotional price; must be below `price` when set. */
  salePrice?: Money;

  status: CatalogStatus;
  availability: ProductAvailability;
  isFeatured: boolean;

  attributes: ProductAttributes;

  /** Service flags — charges/options arrive with the customization phase. */
  stitchingAvailable: boolean;
  customizationAvailable: boolean;

  media: ProductMedia[];
  archivedAt?: ISODateTime;
}

/**
 * Stock record for one sellable product (Phase 13). There are no product
 * variants in this catalog (confirmed: no size/color splits), so inventory
 * is keyed 1:1 on `productId` — a future variant system would add its own
 * `variantId` column and move this key, not duplicate rows per variant.
 *
 * `quantityAvailable` is NEVER stored or settable directly — it is always
 * `quantityOnHand - quantityReserved`, computed by the repository layer at
 * the moment of every read/write so it can never drift from its inputs.
 *
 * `trackingEnabled: false` (the default when no row exists at all) means
 * this product's purchasability is governed ONLY by the existing
 * `ProductAvailability` enum, exactly as before Phase 13 — this is what
 * keeps every pre-Phase-13 product working unchanged, and is also the
 * correct state for a `made_to_order` piece that is crafted per order and
 * has no meaningful "stock count".
 */
export interface InventoryItem extends Timestamps {
  id: ID;
  productId: ID;
  trackingEnabled: boolean;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
}

/** Derived, read-only view of stock — never persisted independently. */
export interface InventoryLevel {
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  lowStockThreshold: number;
  trackingEnabled: boolean;
}

export type InventoryMovementType =
  | "initial_stock"
  | "restock"
  | "sale"
  | "reservation"
  | "reservation_release"
  | "adjustment"
  | "return"
  | "damaged"
  | "correction";

/**
 * Append-only stock ledger — mirrors OrderActivity/PaymentActivity/
 * ShipmentActivity exactly: one immutable row per stock-affecting event,
 * never updated or deleted. `quantityChange` is signed (+restock, -sale);
 * `quantityAfter` is the resulting `quantityOnHand` snapshot at write time,
 * so history reads without recomputing a running total.
 */
export interface InventoryMovement {
  id: ID;
  inventoryItemId: ID;
  productId: ID;
  type: InventoryMovementType;
  /** Signed delta applied to quantityOnHand (or quantityReserved for
   *  reservation/reservation_release — see the movement's `metadata`). */
  quantityChange: number;
  quantityAfter: number;
  actorUserId?: ID;
  orderId?: ID;
  orderItemId?: ID;
  reason?: string;
  /** Idempotency key for reservation/release movements tied to an order,
   *  so a retried checkout or a repeated cancellation can never apply the
   *  same stock change twice. Absent for admin-initiated movements, which
   *  are idempotent by their own form-submission discipline instead. */
  idempotencyKey?: ID;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: ISODateTime;
}

// ── Measurements & customization ────────────────────────────────────

export type MeasurementUnit = "cm" | "in";

/**
 * A single measurement. Keys come from the measurement catalog
 * (src/config/measurements.ts) but unknown keys are allowed so future
 * garment-specific fields never require a schema change.
 */
export interface MeasurementValue {
  key: string; // e.g. "bust", "waist", "sleeve_length"
  value: number; // in the profile's unit
}

export type FitPreference = "fitted" | "regular" | "relaxed";

export interface MeasurementProfile extends Timestamps {
  id: ID;
  /** Owning User id — every access must verify this. */
  userId: ID;
  label: string; // e.g. "Myself", "Mom" — just a label, nothing more
  unit: MeasurementUnit;
  values: MeasurementValue[];
  fitPreference?: FitPreference;
  notes?: string;
  isDefault: boolean;
  /** Soft delete — archived profiles are hidden but preserved for future orders. */
  archivedAt?: ISODateTime;
}

/**
 * Customization request lifecycle. Phase 7B stores and reaches only
 * `draft` — the remaining states are the documented roadmap for the
 * quoting workflow (admin review → quote → customer decision) and are
 * NOT produced by any current flow.
 */
export type CustomizationStatus =
  | "pending"
  | "reviewing"
  | "draft"
  | "quoted"
  | "approved"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

export type CustomizationActivityType =
  | "request_created"
  | "status_changed"
  | "request_approved"
  | "request_rejected"
  | "request_completed"
  | "customer_cancelled"
  | "internal_note_added";

export interface CustomizationActivity {
  id: ID;
  customizationRequestId: ID;
  type: CustomizationActivityType;
  actorUserId?: ID;
  fromStatus?: CustomizationStatus;
  toStatus?: CustomizationStatus;
  createdAt: ISODateTime;
}

export interface CustomizationNote {
  id: ID;
  customizationRequestId: ID;
  authorUserId?: ID;
  authorName: string;
  body: string;
  createdAt: ISODateTime;
}

/**
 * A customer's request for a customised piece (Phase 7B foundation).
 *
 * Deliberately minimal: identity, ownership, an optional product and an
 * optional own measurement profile, the customer's untrusted free-text
 * `details`, and a status. Reference-image uploads belong to the future
 * customization-designer phase together with its storage design — no
 * upload field exists until then. Cart/order attachment
 * (`CartItem.customizationRequestId`) is likewise NOT wired yet; the
 * validation seam for it already exists in
 * src/server/cart/configuration.ts.
 */
export interface CustomizationRequest extends Timestamps {
  id: ID;
  /** Owning User id — every access must verify this. */
  userId: ID;
  productId?: ID; // absent for fully custom designs
  measurementProfileId?: ID;
  orderId?: ID;
  orderItemId?: ID;
  details: string;
  status: CustomizationStatus;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export interface Quote extends Timestamps {
  id: ID;
  customizationRequestId: ID;
  amount: Money;
  validUntil: ISODateTime;
  status: QuoteStatus;
  notes?: string;
}

// ── Cart & orders ───────────────────────────────────────────────────

/**
 * A line in the cart.
 *
 * `unitPrice` is a SNAPSHOT captured when the line was created — the
 * product's price may change afterwards, and the customer must never be
 * silently charged a different amount. Cart reads compare the snapshot to
 * the live price and surface the difference.
 *
 * `configurationKey` distinguishes lines for the same product that differ
 * by future options (unstitched vs stitched vs custom). It is "" today;
 * Phase 7 derives it from the stitching/customisation selection so the
 * same product can sit in the cart more than once.
 */
export interface CartItem {
  id: ID;
  productId: ID;
  quantity: number;
  unitPrice: Money;
  configurationKey: string;
  /** Reserved for Phase 7 — stitching, measurements, customisation. */
  stitching?: {
    selected: boolean;
    measurementProfileId?: ID;
  };
  customizationRequestId?: ID;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** One active cart per user. */
export interface Cart extends Timestamps {
  id: ID;
  userId: ID;
  items: CartItem[];
}

export interface WishlistItem {
  id: ID;
  productId: ID;
  createdAt: ISODateTime;
}

/** One wishlist per user; a product appears at most once. */
export interface Wishlist extends Timestamps {
  id: ID;
  userId: ID;
  items: WishlistItem[];
}

/**
 * Order lifecycle (Phase 6C).
 *
 * Deliberately ONE state today: every order is created as `pending` —
 * placed by the customer, awaiting the studio. No payment has occurred
 * and nothing here may claim otherwise. Future phases extend this union
 * (each with its own migration): payment confirmation (6x), processing/
 * stitching (7), shipping/delivery, and cancellation. Extending a union
 * member list is additive and breaks nothing.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "ready"
  | "completed"
  | "cancelled";

export type OrderActivityType =
  | "order_created"
  | "status_changed"
  | "order_cancelled"
  | "internal_note_added"
  | "payment_created"
  | "payment_attempt_started"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_refunded"
  | "payment_webhook_processed"
  | "shipment_created"
  | "shipment_preparing"
  | "shipment_ready_to_ship"
  | "shipment_dispatched"
  | "shipment_out_for_delivery"
  | "shipment_delivered"
  | "shipment_delivery_failed"
  | "shipment_returned"
  | "shipment_cancelled"
  | "shipment_tracking_updated"
  | "shipment_webhook_processed"
  | "inventory_reserved"
  | "inventory_released";

export interface OrderActivity {
  id: ID;
  orderId: ID;
  type: OrderActivityType;
  actorUserId?: ID;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: ISODateTime;
}

export interface OrderNote {
  id: ID;
  orderId: ID;
  authorUserId?: ID;
  authorName: string;
  body: string;
  createdAt: ISODateTime;
}

/**
 * Customer identity AS IT WAS at the moment of purchase. Orders are
 * historical records: the live User row keeps changing (name edits,
 * deactivation), and the order must stay correct anyway.
 */
export interface OrderCustomerSnapshot {
  name: string;
  email?: string;
  phone?: string;
}

/**
 * Delivery address AS IT WAS at checkout — the values needed for
 * fulfilment, not a reference. The CustomerAddress row can be edited or
 * deleted later without touching any order. (The address book id and its
 * home/work label are deliberately not part of the snapshot.)
 */
export interface OrderAddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  locality?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Immutable order-time copy of the measurements a stitched line was
 * placed with (Phase 7B). Values and unit are copied VERBATIM from the
 * customer's profile inside the order transaction — the profile stays
 * fully mutable afterwards while the order keeps representing exactly
 * what was ordered. `fitPreference` is absent when the profile had none
 * (no default is invented), and the unit/value pairs are never
 * reinterpreted between cm and in.
 */
export interface OrderItemMeasurementSnapshot {
  unit: MeasurementUnit;
  fitPreference?: FitPreference;
  /** The profile's tailor notes at order time, when any existed. */
  notes?: string;
  /** Exact `MeasurementValue` shape — key + value in `unit`. */
  values: MeasurementValue[];
}

/**
 * One ordered line. `productId` is retained for navigation/analytics
 * (products are archived, never hard-deleted), but the snapshot fields
 * make the line historically self-sufficient: name, slug and the exact
 * price charged survive any later product change. Configuration fields
 * ride over from the cart line — an order must never silently lose
 * configuration data.
 *
 * Stitched lines carry the full measurement history (Phase 7A label +
 * Phase 7B `measurements` snapshot); orders placed before Phase 7B may
 * lack `measurements`, and readers must treat that honestly as
 * "snapshot unavailable" rather than substituting the profile's CURRENT
 * values.
 */
export interface OrderItem {
  id: ID;
  productId: ID;
  nameSnapshot: string;
  slugSnapshot: string;
  quantity: number;
  /** Price snapshot the line was charged at — integer paise. */
  unitPrice: Money;
  /** unitPrice × quantity, integer paise. */
  lineSubtotal: Money;
  configurationKey: string;
  stitching?: {
    selected: boolean;
    measurementProfileId?: ID;
    /** Label snapshot taken at order time (Phase 7A). */
    measurementProfileLabel?: string;
    /** Order-time measurement snapshot (Phase 7B). */
    measurements?: OrderItemMeasurementSnapshot;
  };
  customizationRequestId?: ID;
  notes?: string;
}

/**
 * A placed order — the historical record of one confirmed checkout.
 *
 * Money: integer paise throughout. shipping/tax/discount are explicit
 * ZERO amounts (not absent) until those systems exist, so
 * `total = subtotal + shipping + tax − discount` holds today and every
 * later phase changes a value, never the formula.
 *
 * `idempotencyKey` is unique per user: the same confirmation can never
 * create two orders (see the order service for the replay semantics).
 */
export interface Order extends Timestamps {
  id: ID;
  /** Customer-facing number (LCS-XXXX-XXXX) — never the database id. */
  orderNumber: string;
  /** Owning USER id — the ownership anchor, like every customer record. */
  userId: ID;
  status: OrderStatus;
  customer: OrderCustomerSnapshot;
  shippingAddress: OrderAddressSnapshot;
  items: OrderItem[];
  currency: "INR";
  subtotal: Money;
  shippingAmount: Money;
  taxAmount: Money;
  discountAmount: Money;
  total: Money;
  idempotencyKey: string;
  /** Fingerprint of the client-supplied confirmation inputs, for
   *  distinguishing an honest replay from key reuse. */
  requestFingerprint: string;
}

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentProvider = "manual" | "cash_on_delivery" | "online_gateway";
export type PaymentMethod = PaymentProvider;

export type PaymentAttemptStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled";

export type PaymentActivityType =
  | "payment_created"
  | "payment_attempt_started"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_refunded"
  | "webhook_processed";

export interface Payment extends Timestamps {
  id: ID;
  orderId: ID;
  provider: PaymentProvider;
  providerPaymentId?: string;
  amount: Money;
  currency: "INR";
  method: PaymentMethod;
  status: PaymentStatus;
  /** Gateway reference — provider added in a later phase. */
  metadata?: Record<string, string | number | boolean | null>;
  failureCode?: string;
  failureMessage?: string;
}

export interface PaymentAttempt extends Timestamps {
  id: ID;
  paymentId: ID;
  orderId: ID;
  provider: PaymentProvider;
  providerReference?: string;
  amount: Money;
  currency: "INR";
  status: PaymentAttemptStatus;
  idempotencyKey: string;
  failureCode?: string;
  failureMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PaymentActivity {
  id: ID;
  paymentId: ID;
  orderId: ID;
  type: PaymentActivityType;
  actorUserId?: ID;
  fromStatus?: PaymentStatus;
  toStatus?: PaymentStatus;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: ISODateTime;
}

export interface PaymentWebhookEvent extends Timestamps {
  id: ID;
  provider: PaymentProvider;
  providerEventId: string;
  paymentId?: ID;
  orderId?: ID;
  eventType: string;
  processedAt?: ISODateTime;
  metadata?: Record<string, string | number | boolean | null>;
}

// ── Shipping & fulfillment (Phase 11 foundation) ────────────────────

/**
 * Fulfillment lifecycle — deliberately separate from OrderStatus and
 * PaymentStatus, cross-referenced by orderId like Payment. An order can be
 * "processing" while its shipment is "preparing"; a COD order can be
 * "shipped" while its payment is "unpaid". No status here ever implies a
 * value for the other two.
 */
export type ShipmentStatus =
  | "not_ready"
  | "preparing"
  | "ready_to_ship"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "returned"
  | "cancelled";

/**
 * Provider-agnostic method vocabulary. "provider_managed" is the reserved
 * slot for a future real carrier integration (Shiprocket/Delhivery/etc.);
 * nothing here talks to a real provider yet.
 */
export type ShipmentMethod = "standard" | "local_delivery" | "pickup" | "provider_managed";

export type ShipmentActivityType =
  | "shipment_created"
  | "shipment_preparing"
  | "shipment_ready_to_ship"
  | "shipment_dispatched"
  | "shipment_out_for_delivery"
  | "shipment_delivered"
  | "shipment_delivery_failed"
  | "shipment_returned"
  | "shipment_cancelled"
  | "tracking_updated"
  | "webhook_processed";

/**
 * One shipment per order — the order's fulfillment state. The delivery
 * address is NEVER duplicated here: it lives exclusively on
 * `Order.shippingAddress` (an immutable snapshot already), and every
 * shipment reader re-reads it from the order. Carrier/tracking fields are
 * admin-entered text, never a live provider lookup — no real carrier is
 * integrated yet.
 */
export interface Shipment extends Timestamps {
  id: ID;
  orderId: ID;
  status: ShipmentStatus;
  method: ShipmentMethod;
  carrier?: string;
  trackingNumber?: string;
  /** Free-text estimate ("3-5 business days") — never a computed live ETA. */
  estimatedDelivery?: string;
  shippedAt?: ISODateTime;
  deliveredAt?: ISODateTime;
  cancelledAt?: ISODateTime;
  /** Safe operational metadata only — never a provider credential. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ShipmentActivity {
  id: ID;
  shipmentId: ID;
  orderId: ID;
  type: ShipmentActivityType;
  actorUserId?: ID;
  fromStatus?: ShipmentStatus;
  toStatus?: ShipmentStatus;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: ISODateTime;
}

/**
 * Webhook foundation only — no real carrier is connected. Mirrors
 * PaymentWebhookEvent exactly: `(carrier, providerEventId)` is the
 * idempotency key a future integration would dedupe on.
 */
export interface ShipmentWebhookEvent extends Timestamps {
  id: ID;
  carrier: string;
  providerEventId: string;
  shipmentId?: ID;
  orderId?: ID;
  eventType: string;
  processedAt?: ISODateTime;
  metadata?: Record<string, string | number | boolean | null>;
}

// ── Services: appointments & alterations ────────────────────────────

export type AppointmentStatus = "requested" | "confirmed" | "completed" | "cancelled" | "no_show";
export type AppointmentType = "consultation" | "measurement" | "fitting" | "pickup";

export interface Appointment extends Timestamps {
  id: ID;
  userId: ID;
  type: AppointmentType;
  scheduledAt: ISODateTime;
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
}

export type AlterationStatus = "requested" | "received" | "in_progress" | "ready" | "delivered" | "cancelled";

export interface Alteration extends Timestamps {
  id: ID;
  userId: ID;
  orderId?: ID; // alterations may reference an existing order
  description: string;
  status: AlterationStatus;
  dueDate?: ISODateTime;
}

// ── Engagement ──────────────────────────────────────────────────────

export interface Review extends Timestamps {
  id: ID;
  userId: ID;
  productId: ID;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  isApproved: boolean;
}

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp";

export interface Notification extends Timestamps {
  id: ID;
  userId: ID;
  channel: NotificationChannel;
  title: string;
  body: string;
  readAt?: ISODateTime;
}

// ── Governance ──────────────────────────────────────────────────────

export interface AuditLog {
  id: ID;
  actorUserId: ID;
  action: string; // e.g. "order.status_changed"
  entityType: string; // e.g. "Order"
  entityId: ID;
  metadata?: Record<string, unknown>;
  createdAt: ISODateTime;
}
