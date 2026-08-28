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

export interface InventoryItem extends Timestamps {
  id: ID;
  productId: ID;
  /** Set once variants exist; absent means the product itself is stocked. */
  variantId?: ID;
  quantityOnHand: number;
  lowStockThreshold: number;
  location?: string;
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

export type CustomizationStatus =
  | "draft"
  | "quoted"
  | "approved"
  | "rejected";

export interface CustomizationRequest extends Timestamps {
  id: ID;
  userId: ID;
  productId?: ID; // absent for fully custom designs
  measurementProfileId?: ID;
  details: string;
  /** Customer-uploaded reference images. */
  referenceImageUrls: string[];
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
export type OrderStatus = "pending";

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
 * One ordered line. `productId` is retained for navigation/analytics
 * (products are archived, never hard-deleted), but the snapshot fields
 * make the line historically self-sufficient: name, slug and the exact
 * price charged survive any later product change. The Phase-7 reserved
 * configuration fields ride over from the cart line verbatim — an order
 * must never silently lose configuration data. Phase 7 will additionally
 * snapshot the actual measurement VALUES (not just the profile
 * reference) into its customization record.
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
  /** Reserved Phase-7 fields, carried from the cart line untouched. */
  stitching?: {
    selected: boolean;
    measurementProfileId?: ID;
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

export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "refunded";
export type PaymentMethod = "cod" | "upi" | "card" | "netbanking" | "in_store";

export interface Payment extends Timestamps {
  id: ID;
  orderId: ID;
  amount: Money;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Gateway reference — provider added in a later phase. */
  providerRef?: string;
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
