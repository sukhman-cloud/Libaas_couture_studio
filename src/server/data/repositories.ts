import "server-only";
import type {
  Appointment,
  AuthCredential,
  Cart,
  CatalogStatus,
  Category,
  Collection,
  CustomerProfile,
  ID,
  MeasurementProfile,
  MediaAsset,
  Order,
  PasswordResetToken,
  Product,
  ProductAvailability,
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

export interface OrderRepository {
  list(params?: ListParams): Promise<Order[]>;
  getById(id: ID): Promise<Order | null>;
  count(): Promise<number>;
  countByStatus(): Promise<Record<string, number>>;
}

export interface AppointmentRepository {
  list(params?: ListParams): Promise<Appointment[]>;
  count(): Promise<number>;
}

/* ── Identity & customer data (Phase 3) ─────────────────────────── */

export interface UserRepository {
  getById(id: ID): Promise<User | null>;
  /** Lookup by normalized (lowercased, trimmed) email. */
  findByEmail(email: string): Promise<User | null>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
}

export interface CredentialRepository {
  getByUserId(userId: ID): Promise<AuthCredential | null>;
  create(credential: AuthCredential): Promise<AuthCredential>;
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
  /** Active (non-archived) profiles for one customer. */
  listByCustomerId(customerId: ID): Promise<MeasurementProfile[]>;
  getById(id: ID): Promise<MeasurementProfile | null>;
  create(profile: MeasurementProfile): Promise<MeasurementProfile>;
  update(profile: MeasurementProfile): Promise<MeasurementProfile>;
}

/* ── Customer commerce (Phase 5A) ───────────────────────────────── */

export interface CartRepository {
  /** The customer's single active cart, if one exists. */
  getByCustomerId(customerId: ID): Promise<Cart | null>;
  create(cart: Cart): Promise<Cart>;
  update(cart: Cart): Promise<Cart>;
}

export interface WishlistRepository {
  getByCustomerId(customerId: ID): Promise<Wishlist | null>;
  create(wishlist: Wishlist): Promise<Wishlist>;
  update(wishlist: Wishlist): Promise<Wishlist>;
}

export interface PasswordResetTokenRepository {
  create(token: PasswordResetToken): Promise<PasswordResetToken>;
  /** Unused, unexpired token by its SHA-256 hash. */
  findValidByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: ID): Promise<void>;
}

export interface Repositories {
  products: ProductRepository;
  categories: CategoryRepository;
  collections: CollectionRepository;
  media: MediaRepository;
  orders: OrderRepository;
  appointments: AppointmentRepository;
  users: UserRepository;
  credentials: CredentialRepository;
  customers: CustomerProfileRepository;
  measurementProfiles: MeasurementProfileRepository;
  passwordResetTokens: PasswordResetTokenRepository;
  carts: CartRepository;
  wishlists: WishlistRepository;
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
