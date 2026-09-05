import "server-only";
import type {
  AdminUser,
  Appointment,
  AuthCredential,
  Cart,
  CatalogStatus,
  Category,
  Collection,
  CustomerProfile,
  CustomizationRequest,
  ID,
  InventoryItem,
  InventoryMovement,
  MeasurementProfile,
  MediaAsset,
  Order,
  OrderActivity,
  OrderNote,
  OrderStatus,
  Payment,
  PaymentActivity,
  PaymentAttempt,
  PaymentStatus,
  PaymentWebhookEvent,
  CustomizationActivity,
  CustomizationNote,
  CustomizationStatus,
  PasswordResetToken,
  Product,
  ProductAvailability,
  Role,
  RoleName,
  Shipment,
  ShipmentActivity,
  ShipmentStatus,
  ShipmentWebhookEvent,
  User,
  Wishlist,
} from "@/types/domain";

/**
 * Repository contracts — the seam between the application and storage.
 *
 * Phases 1–4 ship in-memory and JSON-file implementations with EMPTY seed
 * data (no fake records). A database implementation (e.g. Prisma +
 * Postgres with real migrations) can replace them behind these same
 * interfaces without touching UI code.
 */

export interface ListParams {
  limit?: number;
  offset?: number;
}

/** A page of results plus the total matching count (for pagination UI). */
export interface Paged<T> {
  rows: T[];
  total: number;
}

/* ── Catalog (Phase 4A) ─────────────────────────────────────────── */

export type ProductSort =
  | "updated_desc"
  | "created_desc"
  | "name_asc"
  | "name_desc"
  | "price_asc"
  | "price_desc";

/**
 * Product query shape. The admin catalog uses it today; the future
 * customer catalog reuses the same repository (typically with
 * `status: "published"`), so there is only ever one product model.
 */
/** Fields free-text search may look at. */
export type ProductSearchField =
  | "name"
  | "sku"
  | "slug"
  | "tags"
  | "shortDescription"
  | "description";

/** Admin search covers internal identifiers; the public catalog does not. */
export const ADMIN_SEARCH_FIELDS: ProductSearchField[] = [
  "name",
  "sku",
  "slug",
  "tags",
];

export const PUBLIC_SEARCH_FIELDS: ProductSearchField[] = [
  "name",
  "shortDescription",
  "description",
  "tags",
];

export interface ProductQuery extends ListParams {
  /** Free text; see `searchFields` for what it looks at. */
  search?: string;
  /** Defaults to ADMIN_SEARCH_FIELDS. */
  searchFields?: ProductSearchField[];
  status?: CatalogStatus;
  /** Exclude archived rows without pinning a single status. */
  excludeArchived?: boolean;
  availability?: ProductAvailability;
  categoryId?: ID;
  collectionId?: ID;
  featured?: boolean;
  stitchingAvailable?: boolean;
  customizationAvailable?: boolean;
  fabric?: string;
  colour?: string;
  occasion?: string;
  work?: string;
  tag?: string;
  /** Inclusive bounds in integer paise, compared to the effective price. */
  priceMin?: number;
  priceMax?: number;
  sort?: ProductSort;
}

/**
 * Filter options derived from real catalog data — never a hardcoded
 * vocabulary. Values a DB implementation would produce with SELECT DISTINCT.
 */
export interface CatalogFacets {
  fabrics: string[];
  colours: string[];
  occasions: string[];
  works: string[];
  availabilities: ProductAvailability[];
  /** Effective-price bounds in paise across the matching set. */
  priceRange: { min: number; max: number } | null;
}

export interface ProductRepository {
  query(query?: ProductQuery): Promise<Paged<Product>>;
  /** Distinct attribute values + price bounds for the matching set. */
  facets(query?: ProductQuery): Promise<CatalogFacets>;
  list(params?: ListParams): Promise<Product[]>;
  getById(id: ID): Promise<Product | null>;
  getBySlug(slug: string): Promise<Product | null>;
  /** Lookup by normalized (uppercased) SKU — for uniqueness checks. */
  getBySku(sku: string): Promise<Product | null>;
  create(product: Product): Promise<Product>;
  update(product: Product): Promise<Product>;
  /** Published, non-archived products. */
  countActive(): Promise<number>;
  countByStatus(): Promise<Record<CatalogStatus, number>>;
}

export interface CategoryQuery extends ListParams {
  search?: string;
  status?: CatalogStatus;
  excludeArchived?: boolean;
}

export interface CategoryRepository {
  /** Published, non-archived categories in sort order. */
  list(): Promise<Category[]>;
  query(query?: CategoryQuery): Promise<Paged<Category>>;
  getById(id: ID): Promise<Category | null>;
  getBySlug(slug: string): Promise<Category | null>;
  create(category: Category): Promise<Category>;
  update(category: Category): Promise<Category>;
  count(): Promise<number>;
}

export interface CollectionQuery extends ListParams {
  search?: string;
  status?: CatalogStatus;
  excludeArchived?: boolean;
}

export interface CollectionRepository {
  list(): Promise<Collection[]>;
  query(query?: CollectionQuery): Promise<Paged<Collection>>;
  getById(id: ID): Promise<Collection | null>;
  getBySlug(slug: string): Promise<Collection | null>;
  create(collection: Collection): Promise<Collection>;
  update(collection: Collection): Promise<Collection>;
  count(): Promise<number>;
}

export interface MediaRepository {
  getById(id: ID): Promise<MediaAsset | null>;
  listByIds(ids: ID[]): Promise<MediaAsset[]>;
  create(asset: MediaAsset): Promise<MediaAsset>;
  delete(id: ID): Promise<void>;
}

/* ── Operations (Phase 1) ───────────────────────────────────────── */

/**
 * Orders (Phase 6C). Orders are HISTORICAL records: there is deliberately
 * no update and no delete — later phases add narrow status-transition
 * methods, never general mutation.
 *
 * INVARIANTS `create` must enforce (both providers):
 *   - `orderNumber` unique;
 *   - `(userId, idempotencyKey)` unique — the same confirmation can never
 *     create two orders. Violations throw; callers treat a duplicate-key
 *     failure as "look the existing order up and return it".
 */
/** Validated admin order query (Phase 7C). The service layer normalizes
 *  and caps every field BEFORE it reaches a repository. */
export type OrderSort = "newest" | "oldest" | "total_desc" | "total_asc";

export interface OrderQuery extends ListParams {
  /** Normalized free text, matched against order number, customer name
   *  and customer email via the ONE shared predicate (order-matching in
   *  catalog-logic.ts) — never against credentials. */
  search?: string;
  status?: Order["status"];
  /** Inclusive ISO datetime bounds on createdAt, for analytics/reporting. */
  createdAtFrom?: string;
  createdAtTo?: string;
  /** Defaults to "newest"; every sort has a stable id tiebreak. */
  sort?: OrderSort;
}

export interface OrderRepository {
  list(params?: ListParams): Promise<Order[]>;
  getById(id: ID): Promise<Order | null>;
  /** Lookup by the customer-facing number. Callers verify ownership. */
  getByOrderNumber(orderNumber: string): Promise<Order | null>;
  /** The order a (user, idempotency key) pair already created, if any. */
  getByIdempotencyKey(userId: ID, idempotencyKey: string): Promise<Order | null>;
  /** Ownership-scoped listing, newest first (Phase 6D's order history). */
  listByUserId(userId: ID, params?: ListParams): Promise<Order[]>;
  /** Admin search/filter/sort/pagination (Phase 7C) — both providers run
   *  the SHARED predicates so behavior is identical. */
  query(params: OrderQuery): Promise<Paged<Order>>;
  create(order: Order): Promise<Order>;
  count(): Promise<number>;
  countByStatus(): Promise<Record<string, number>>;
  transitionStatus(
    orderId: ID,
    expectedStatus: OrderStatus,
    nextStatus: OrderStatus,
    updatedAt: string,
  ): Promise<Order | null>;
}

export interface OrderActivityRepository {
  listByOrderId(orderId: ID): Promise<OrderActivity[]>;
  create(activity: OrderActivity): Promise<OrderActivity>;
  /** Most recent rows across ALL orders, for the audit log feed. */
  listRecent(limit: number): Promise<OrderActivity[]>;
}

export interface OrderNoteRepository {
  listByOrderId(orderId: ID): Promise<OrderNote[]>;
  create(note: OrderNote): Promise<OrderNote>;
}

export interface PaymentRepository {
  getById(id: ID): Promise<Payment | null>;
  getByOrderId(orderId: ID): Promise<Payment | null>;
  listByOrderIds(orderIds: ID[]): Promise<Payment[]>;
  /** Every payment in the store. There is no independent index on payments
   *  beyond their owning order, so admin search/filter/sort/pagination is
   *  composed in the service layer by joining against Order (same pattern
   *  as listAdminCustomizations joining CustomizationRequest → User). */
  list(): Promise<Payment[]>;
  create(payment: Payment): Promise<Payment>;
  update(payment: Payment): Promise<Payment>;
  transitionStatus(
    paymentId: ID,
    expectedStatus: PaymentStatus,
    nextStatus: PaymentStatus,
    updatedAt: string,
  ): Promise<Payment | null>;
}

export interface PaymentAttemptRepository {
  listByPaymentId(paymentId: ID): Promise<PaymentAttempt[]>;
  getByIdempotencyKey(paymentId: ID, idempotencyKey: string): Promise<PaymentAttempt | null>;
  create(attempt: PaymentAttempt): Promise<PaymentAttempt>;
  update(attempt: PaymentAttempt): Promise<PaymentAttempt>;
}

export interface PaymentActivityRepository {
  listByPaymentId(paymentId: ID): Promise<PaymentActivity[]>;
  create(activity: PaymentActivity): Promise<PaymentActivity>;
  /** Most recent rows across ALL payments, for the audit log feed. */
  listRecent(limit: number): Promise<PaymentActivity[]>;
}

export interface PaymentWebhookEventRepository {
  getByProviderEvent(provider: PaymentWebhookEvent["provider"], providerEventId: string): Promise<PaymentWebhookEvent | null>;
  create(event: PaymentWebhookEvent): Promise<PaymentWebhookEvent>;
  markProcessed(id: ID, processedAt: string, paymentId?: ID, orderId?: ID): Promise<PaymentWebhookEvent | null>;
}

export interface ShipmentRepository {
  getById(id: ID): Promise<Shipment | null>;
  getByOrderId(orderId: ID): Promise<Shipment | null>;
  listByOrderIds(orderIds: ID[]): Promise<Shipment[]>;
  create(shipment: Shipment): Promise<Shipment>;
  update(shipment: Shipment): Promise<Shipment>;
  transitionStatus(
    shipmentId: ID,
    expectedStatus: ShipmentStatus,
    nextStatus: ShipmentStatus,
    updatedAt: string,
  ): Promise<Shipment | null>;
}

export interface ShipmentActivityRepository {
  listByShipmentId(shipmentId: ID): Promise<ShipmentActivity[]>;
  create(activity: ShipmentActivity): Promise<ShipmentActivity>;
  /** Most recent rows across ALL shipments, for the audit log feed. */
  listRecent(limit: number): Promise<ShipmentActivity[]>;
}

export interface ShipmentWebhookEventRepository {
  getByProviderEvent(carrier: string, providerEventId: string): Promise<ShipmentWebhookEvent | null>;
  create(event: ShipmentWebhookEvent): Promise<ShipmentWebhookEvent>;
  markProcessed(id: ID, processedAt: string, shipmentId?: ID, orderId?: ID): Promise<ShipmentWebhookEvent | null>;
}

/**
 * Inventory (Phase 13). One row per PRODUCT (no variants in this catalog —
 * see the InventoryItem doc comment in domain.ts). `quantityAvailable` is
 * never a repository input; it is always derived as
 * `quantityOnHand - quantityReserved` by the caller/service layer.
 *
 * `reserve`/`release`/`adjust` are all compare-and-set deltas, mirroring
 * `OrderRepository.transitionStatus`: the caller supplies the row it read,
 * the repository only applies the change if the row is UNCHANGED since
 * that read (by comparing both quantity fields), and returns null on a
 * mismatch so the caller can re-read and retry rather than silently
 * clobbering a concurrent write. This is the same optimistic-concurrency
 * discipline used for order/payment/shipment status, applied to a
 * quantity delta instead of a fixed-state transition.
 */
export interface InventoryRepository {
  getById(id: ID): Promise<InventoryItem | null>;
  getByProductId(productId: ID): Promise<InventoryItem | null>;
  listByProductIds(productIds: ID[]): Promise<InventoryItem[]>;
  /** Admin inventory list: search + low-stock/out-of-stock filters. */
  query(params: InventoryQuery): Promise<Paged<InventoryItem>>;
  create(item: InventoryItem): Promise<InventoryItem>;
  update(item: InventoryItem): Promise<InventoryItem>;
  /**
   * Apply a signed delta to `quantityOnHand` (restock/adjustment/damage/
   * correction/return/initial_stock). Refuses (returns null) if the
   * resulting quantity would be negative, or if `expected.quantityOnHand`
   * /`expected.quantityReserved` no longer match the stored row.
   */
  adjustOnHand(
    inventoryItemId: ID,
    delta: number,
    expected: { quantityOnHand: number; quantityReserved: number },
  ): Promise<InventoryItem | null>;
  /**
   * Move `quantity` from available into reserved (order creation) or back
   * (cancellation/release) — `delta` is positive to reserve, negative to
   * release. Refuses if reserving would exceed `quantityOnHand`, if
   * releasing would take `quantityReserved` below zero, or if `expected`
   * no longer matches the stored row.
   */
  adjustReserved(
    inventoryItemId: ID,
    delta: number,
    expected: { quantityOnHand: number; quantityReserved: number },
  ): Promise<InventoryItem | null>;
}

export interface InventoryQuery extends ListParams {
  search?: string;
  /** available <= lowStockThreshold (and > 0). */
  lowStockOnly?: boolean;
  /** available <= 0. */
  outOfStockOnly?: boolean;
  trackingEnabledOnly?: boolean;
}

export interface InventoryMovementRepository {
  listByInventoryItemId(inventoryItemId: ID, params?: ListParams): Promise<InventoryMovement[]>;
  listByOrderId(orderId: ID): Promise<InventoryMovement[]>;
  /** Idempotency lookup for order-tied reservation/release movements —
   *  the same (inventoryItemId, idempotencyKey) pair can only ever create
   *  one row, mirroring PaymentAttemptRepository.getByIdempotencyKey. */
  getByIdempotencyKey(inventoryItemId: ID, idempotencyKey: ID): Promise<InventoryMovement | null>;
  create(movement: InventoryMovement): Promise<InventoryMovement>;
  /** Most recent rows across ALL inventory items, for the audit log feed. */
  listRecent(limit: number): Promise<InventoryMovement[]>;
}

export interface AppointmentRepository {
  list(params?: ListParams): Promise<Appointment[]>;
  count(): Promise<number>;
}

/* ── Identity & customer data (Phase 3) ─────────────────────────── */

export type CustomerSort = "newest" | "oldest" | "name_asc" | "name_desc";

export interface CustomerQuery extends ListParams {
  /** Matched against name, email and phone. */
  search?: string;
  /** Defaults to "newest"; every sort has a stable id tiebreak. */
  sort?: CustomerSort;
}

export interface UserRepository {
  getById(id: ID): Promise<User | null>;
  /** Lookup by normalized (lowercased, trimmed) email. */
  findByEmail(email: string): Promise<User | null>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
  /** Admin search/filter/sort/pagination over customer accounts only
   *  (kind === "customer"). Both providers run the SHARED predicates so
   *  behavior is identical. */
  queryCustomers(params: CustomerQuery): Promise<Paged<User>>;
}

export interface CredentialRepository {
  getByUserId(userId: ID): Promise<AuthCredential | null>;
  create(credential: AuthCredential): Promise<AuthCredential>;
  /**
   * INVARIANT: `sessionVersion` is monotonic. Every session token carries
   * the version it was minted with, so lowering the stored version would
   * revive sessions that a password change, reset or deactivation had
   * already invalidated. An update that would move it backwards is
   * REJECTED (throws) — implementations enforce this, callers do not have
   * to. Rewriting the same version is allowed; that is an ordinary edit
   * that invalidates nothing.
   */
  update(credential: AuthCredential): Promise<AuthCredential>;
}

export interface CustomerProfileRepository {
  getByUserId(userId: ID): Promise<CustomerProfile | null>;
  create(profile: CustomerProfile): Promise<CustomerProfile>;
  update(profile: CustomerProfile): Promise<CustomerProfile>;
  list(params?: ListParams): Promise<CustomerProfile[]>;
  count(): Promise<number>;
}

export interface MeasurementProfileRepository {
  /** Active (non-archived) profiles owned by one user. */
  listByUserId(userId: ID): Promise<MeasurementProfile[]>;
  getById(id: ID): Promise<MeasurementProfile | null>;
  create(profile: MeasurementProfile): Promise<MeasurementProfile>;
  update(profile: MeasurementProfile): Promise<MeasurementProfile>;
}

/* ── Customer commerce (Phase 5A) ───────────────────────────────── */

export interface CartRepository {
  /** The user's single active cart, if one exists. */
  getByUserId(userId: ID): Promise<Cart | null>;
  create(cart: Cart): Promise<Cart>;
  update(cart: Cart): Promise<Cart>;
}

export interface WishlistRepository {
  getByUserId(userId: ID): Promise<Wishlist | null>;
  create(wishlist: Wishlist): Promise<Wishlist>;
  update(wishlist: Wishlist): Promise<Wishlist>;
}

export interface PasswordResetTokenRepository {
  create(token: PasswordResetToken): Promise<PasswordResetToken>;
  /** Unused, unexpired token by its SHA-256 hash. */
  findValidByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: ID): Promise<void>;
}

/* ── Admin accounts (Phase 14) ───────────────────────────────────── */

/**
 * Fixed, seeded reference rows — never created or edited through the
 * application. `list`/`getByName` exist purely for lookups when
 * provisioning an admin account.
 */
export interface RoleRepository {
  list(): Promise<Role[]>;
  getById(id: ID): Promise<Role | null>;
  getByName(name: RoleName): Promise<Role | null>;
}

/**
 * The privileged-identity marker. A `User` (kind admin) is a real,
 * usable admin ONLY once it has a row here — this is the single write
 * a self-promotion attack would need, and it is never reachable from a
 * public/customer-facing code path (see docs for the provisioning flow).
 */
export interface AdminUserRepository {
  getByUserId(userId: ID): Promise<AdminUser | null>;
  /** Every admin account — the staff management page's roster. */
  list(): Promise<AdminUser[]>;
  /** Whether ANY admin account exists yet — the bootstrap script's guard. */
  count(): Promise<number>;
  create(adminUser: AdminUser): Promise<AdminUser>;
  /** Role reassignment — replaces the existing row for that user. */
  update(adminUser: AdminUser): Promise<AdminUser>;
}

/* ── Customization foundation (Phase 7B) ────────────────────────── */

export interface CustomizationRequestRepository {
  /** Any row by id — callers verify `userId` ownership themselves. */
  getById(id: ID): Promise<CustomizationRequest | null>;
  list(): Promise<CustomizationRequest[]>;
  /** A user's requests, newest first. */
  listByUserId(userId: ID): Promise<CustomizationRequest[]>;
  create(request: CustomizationRequest): Promise<CustomizationRequest>;
  update(request: CustomizationRequest): Promise<CustomizationRequest>;
  transitionStatus(id: ID, expected: CustomizationStatus, next: CustomizationStatus, updatedAt: string): Promise<CustomizationRequest | null>;
}

export interface CustomizationActivityRepository {
  listByRequestId(requestId: ID): Promise<CustomizationActivity[]>;
  create(activity: CustomizationActivity): Promise<CustomizationActivity>;
  /** Most recent rows across ALL requests, for the audit log feed. */
  listRecent(limit: number): Promise<CustomizationActivity[]>;
}

export interface CustomizationNoteRepository {
  listByRequestId(requestId: ID): Promise<CustomizationNote[]>;
  create(note: CustomizationNote): Promise<CustomizationNote>;
}

/**
 * The data-access surface. Everything an operation can read or write.
 * A transaction callback receives exactly this — no nested transactions.
 */
export interface StoreRepositories {
  products: ProductRepository;
  categories: CategoryRepository;
  collections: CollectionRepository;
  media: MediaRepository;
  orders: OrderRepository;
  appointments: AppointmentRepository;
  users: UserRepository;
  credentials: CredentialRepository;
  roles: RoleRepository;
  adminUsers: AdminUserRepository;
  customers: CustomerProfileRepository;
  measurementProfiles: MeasurementProfileRepository;
  passwordResetTokens: PasswordResetTokenRepository;
  carts: CartRepository;
  wishlists: WishlistRepository;
  customizationRequests: CustomizationRequestRepository;
  customizationActivities: CustomizationActivityRepository;
  customizationNotes: CustomizationNoteRepository;
  orderActivities: OrderActivityRepository;
  orderNotes: OrderNoteRepository;
  payments: PaymentRepository;
  paymentAttempts: PaymentAttemptRepository;
  paymentActivities: PaymentActivityRepository;
  paymentWebhookEvents: PaymentWebhookEventRepository;
  shipments: ShipmentRepository;
  shipmentActivities: ShipmentActivityRepository;
  shipmentWebhookEvents: ShipmentWebhookEventRepository;
  inventoryItems: InventoryRepository;
  inventoryMovements: InventoryMovementRepository;
}

export interface Repositories extends StoreRepositories {
  /**
   * Run several writes as one unit: they all land, or none do.
   *
   * ```ts
   * await repos.transaction(async (tx) => {
   *   const user = await tx.users.create(...);
   *   await tx.credentials.create(...);   // a failure here undoes the user
   *   await tx.customers.create(...);
   * });
   * ```
   *
   * WHAT EACH PROVIDER ACTUALLY GUARANTEES
   *
   * The JSON provider is NOT a database and does not pretend to be one.
   * It gives:
   *   - atomic commit — the whole transaction is written by a single
   *     atomic file replace, so the file never holds a half-done operation;
   *   - rollback — a throw restores the in-memory store to its exact
   *     pre-transaction contents;
   *   - serialization — transactions and ordinary writes take the same
   *     process-wide lock, so no other write interleaves.
   * It does NOT give: durability across processes, isolation levels,
   * savepoints, or protection against a second process writing the same
   * file. Those arrive with PostgreSQL, where this becomes a real BEGIN /
   * COMMIT / ROLLBACK and the guarantee only strengthens.
   *
   * DEADLOCK RULE: never acquire a domain lock (`withLock`) inside a
   * transaction callback. Locks are always taken domain-first, store-second;
   * reversing that inside a callback is the one way to build a cycle.
   */
  transaction<T>(fn: (tx: StoreRepositories) => Promise<T>): Promise<T>;
}

// Re-exported so consumers can import entity types from one place.
export type {
  Product,
  ProductAvailability,
  Category,
  Collection,
  MediaAsset,
  Order,
  Appointment,
};
