# Phase 5D — PostgreSQL + Prisma database foundation

This document is the decision log for the first real database layer. The
JSON provider remains fully supported (and remains the local-development
default); PostgreSQL is opt-in per environment. Nothing in the application
above the repository interfaces changed.

```
Next.js → server actions / services → Repository interfaces
                                          ├── memory provider   (tests)
                                          ├── file provider     (.data/dev-store.json — local default)
                                          └── postgres provider (Prisma → PostgreSQL)   ← NEW
```

- Prisma **6.19.3** (`prisma` dev-dependency, `@prisma/client` runtime).
  Prisma 7 (7.x, driver-adapter runtime, new client generator) was
  deliberately not adopted in the same phase as the first migration; the
  upgrade is mechanical and can be its own change later.
- Schema: [`prisma/schema.prisma`](../prisma/schema.prisma). Migrations:
  `prisma/migrations/` (committed; reproducible with `prisma migrate
  deploy` from a clean database).

## Switching providers

| Mode | Environment |
| --- | --- |
| Local development (default) | `DATA_PROVIDER=file` (or unset) — JSON store, no database needed |
| Database mode | `DATA_PROVIDER=postgres` + `DATABASE_URL=postgresql://…` |
| Throwaway tests | `DATA_PROVIDER=memory` |

`DATA_PROVIDER=postgres` without `DATABASE_URL` refuses to boot with a
readable message (src/lib/env.ts). Normal local development therefore can
never accidentally point at a real database — selecting postgres is always
an explicit, two-variable act.

## Schema decisions

**IDs.** TEXT primary keys, application-supplied (`crypto.randomUUID()`),
no database defaults. The JSON→PostgreSQL migration preserves every
existing id byte-for-byte; a missing id fails loudly instead of being
silently minted.

**Timestamps.** Application-managed `timestamp(3)` columns. Deliberately no
`@updatedAt` / `@default(now())` — the domain stamps these itself and the
migration carries original values through unchanged (millisecond-exact
ISO-string round trip).

**Money.** `BIGINT` integer paise + a TEXT currency column (`price_amount`
/ `price_currency`, `sale_price_amount`, `unit_price_amount` on cart
lines). Never floats. The repository layer converts BigInt ↔ number with a
safe-integer guard.

**Embedded arrays → child tables with `position`.** Addresses, measurement
values, product media, secondary-category and collection links, cart and
wishlist items each became a table with a `position` column recording the
original array index, so the domain arrays round-trip in exact order.
`ProductMedia` keeps both `position` (array order) and `sortOrder`
(display order) because they are genuinely different things.

**Product attributes (spec §9).** The five keys the Phase 4C catalog
actually filters and facets on — `fabric`, `colour`, `occasion`, `work`,
`fit` — are real nullable columns. The open-ended `attributes.extra` map
stays `JSONB` (`attributes_extra`): it exists precisely so new attributes
need no schema change, which is the definition of what should NOT be
normalized.

**Product tags (spec §10).** PostgreSQL `TEXT[]`. Current usage is exact
`includes` filtering and search-haystack joining — no tag management UI, no
tag renaming, no per-tag metadata. An array preserves order, round-trips
exactly, and can be indexed with GIN later if tag filtering ever needs to
be pushed into SQL. A normalized Tag/ProductTag pair would add two tables
for no present behavior.

**Enums.** `user_kind`, `catalog_status`, `product_availability`,
`address_label`, `measurement_unit`, `fit_preference` are PostgreSQL enums
— closed vocabularies in the domain, so invalid values are impossible at
the database level. Measurement KEYS stay TEXT by design (unknown keys are
explicitly allowed by the domain).

**Check constraints** (hand-written in the migration; Prisma's DSL cannot
express them): non-negative `price_amount` / `sale_price_amount` /
`unit_price_amount`, `quantity >= 1`, `session_version >= 1`.

## Uniqueness the database now enforces

| Constraint | Where |
| --- | --- |
| user email | `users.email` UNIQUE (nullable; stored lowercase by the validation boundary) |
| SKU | `products.sku` UNIQUE (stored uppercase by the validation boundary) |
| product / category / collection slug | UNIQUE each |
| one credential / profile / cart / wishlist per user | UNIQUE `user_id` on each |
| a product at most once per wishlist | UNIQUE `(wishlist_id, product_id)` |
| one cart line per product + configuration | UNIQUE `(cart_id, product_id, configuration_key)` |
| one measurement value per key | PK `(profile_id, key)` |
| media storage key | UNIQUE `storage_key` |
| reset token hash | UNIQUE `token_hash` |

Application-level checks still run first (they produce the friendly form
errors); the constraints are the backstop that makes corruption impossible
rather than merely unlikely.

## ON DELETE policy (spec §22)

**RESTRICT everywhere**, with one exception. No hard-delete paths exist in
the application — customers are deactivated, catalog rows are archived —
so restrictive FKs cost nothing today and make accidental cascade loss
impossible. Notable calls:

- `product_media.media_id → media_assets`: RESTRICT. The admin flow
  detaches media from the product **before** deleting the asset
  (`deleteProductMedia`), so the order is naturally safe, and a bug that
  tried to delete a still-referenced asset now fails loudly instead of
  orphaning gallery rows.
- `customer_profiles.default_address_id → customer_addresses`: **SET NULL**
  (the exception). The provider rewrites the address list as
  delete-and-recreate inside one transaction; SET NULL keeps every
  intermediate state FK-valid without deferring constraints. The
  application re-points the default in the same write.
- `categories.parent_id → categories`: RESTRICT; hierarchy **cycles**
  remain an application-level guarantee (the admin action walks the
  ancestor chain), as before.

## Indexes (spec §23)

Uniques above double as lookup indexes (email, sku, slugs, storage key,
token hash, one-per-user tables). Added secondary indexes: product
`status`, `availability`, `category_id`; `product_media(product_id)`,
`(media_id)`; join tables' reverse side (`category_id`, `collection_id`);
`cart_items(cart_id)`, `(product_id)`; `wishlist_items(wishlist_id)`,
`(product_id)`; `customer_addresses(profile_id)`;
`measurement_profiles(user_id)`; `password_reset_tokens(user_id)`;
category/collection `status`. Nothing speculative beyond that.

## Provider behavior

**Catalog queries reuse the JSON provider's exact logic.** Filtering,
sorting, faceting and paging live in `src/server/data/catalog-logic.ts` —
pure functions extracted from the store provider and now called by BOTH
providers. The PostgreSQL provider loads catalog rows (one indexed query
with includes) and applies the shared predicates in process. At boutique
scale that is single-digit milliseconds; it also makes provider drift
structurally impossible. Pushing filters into SQL is a later optimisation
that must ship with the parity matrix used in this phase.

**Writes.** Entities with child tables are written as "replace children"
(update row → deleteMany children → createMany from the array), inside a
transaction opened by the provider unless the caller already opened one
(`repos.transaction`). `update()` receives whole entities, so replacement
is exact.

**`repos.transaction(fn)`** maps to `prisma.$transaction` (interactive):
BEGIN → callback with transaction-bound repositories → COMMIT, rollback on
throw. Isolation is READ COMMITTED. No Prisma types cross the repository
boundary.

**`sessionVersion` monotonicity** is enforced in the UPDATE's WHERE clause
(`session_version <= new`) — one statement, same guarantee and same error
message as the JSON provider's locked precondition.

**Error parity.** "not found" updates throw the same `"<Label> not found:
<id>"` messages as the JSON provider; `media.delete` and
`passwordResetTokens.markUsed` stay idempotent-silent.

**Lookup normalization (review finding, fixed).** `findByEmail` and
`getBySku` match EXACTLY on the normalized value (lowercase email,
uppercase SKU) instead of Prisma's `mode: "insensitive"`, which compiles to
unescaped `ILIKE` — `_`/`%` in the argument would act as wildcards and
could resolve the wrong account. The exact match also uses the unique
index. The importer warns (counts only) if a store holds unnormalized
values.

**Atomic aggregate reads (review finding, fixed).** Reads that include
child rows use `relationLoadStrategy: "join"` (`relationJoins` preview
feature), so parent + children come from one SQL statement — a consistent
MVCC snapshot, matching the atomic reads the in-memory store gave for
free. Multi-table writes run under the same tuned transaction limits as
`repos.transaction` (10s/30s, not Prisma's 2s/5s defaults).

**`orders` / `appointments`** repositories return empty results — the spec
defers those tables to the checkout phase, and the JSON store was empty by
design. No Order/Payment/Appointment/etc. tables were created.

## Locking (spec §34)

`withLock` is **unchanged and still required**:

- the JSON provider depends on it entirely (unchanged);
- on PostgreSQL, `signup:<email>` still closes the duplicate-check race
  (two concurrent signups both passing `findByEmail` before either
  commits; the email unique constraint is now the backstop) and
  `customer:<id>` still serializes read-modify-write sequences that READ
  COMMITTED alone does not protect (`mutateAccount`'s re-read is only
  authoritative because writers for that account are serialized).

The locks are per-process, which matches the one-instance deployment this
phase targets. Multi-instance deployment (later) replaces the domain locks
with `SELECT … FOR UPDATE` on the users row inside `mutateAccount` — a
provider-level change with the same call shape. Documented, not built.

## Corruption model (spec §35)

The PostgreSQL provider has **none** of the JSON provider's fail-closed
machinery — no backups, no recovery, no store-version checks. Durability,
atomicity and consistency are the database's job; connection failures
surface as errors. The JSON provider keeps all of its protections,
untouched.

## Sessions (spec §16)

Sessions remain HMAC-signed cookies validated against
`users`/`auth_credentials` (`sessionVersion`). They were never stored as
rows and still are not — no session table was invented.

## Migration runbook

```bash
# 1. Schema onto the target database (creates all tables, constraints):
DATABASE_URL=... npx prisma migrate deploy

# 2. Rehearse (imports everything, rolls back on purpose):
DATABASE_URL=... node scripts/migrate-to-postgres.mjs --dry-run

# 3. Import (validates first; refuses a non-empty target; one transaction):
DATABASE_URL=... node scripts/migrate-to-postgres.mjs

# 4. Independent verification (field-by-field, counts, ids, hashes):
DATABASE_URL=... node scripts/verify-migration.mjs

# 5. Switch the app (in .env.local):  DATA_PROVIDER=postgres, DATABASE_URL=...
```

**Re-runnability (spec §28):** the empty-target strategy. The whole import
is ONE transaction against a database that must be empty, so a failed run
leaves the target exactly as it found it and can simply be run again.
There is no merge mode and no duplicate-detection heuristic to trust; the
importer refuses a non-empty database explicitly.

**Rollback:** `scripts/export-postgres-store.mjs` reconstructs a v4 store
file from the database at any time; `DATA_PROVIDER=file` serves it. The
original `.data/dev-store.json` additionally stays in place, untouched,
until the owner explicitly retires it.

The importer never modifies the source (it fingerprints the file before
and after), never prints hashes or personal data, accepts v3 backups
(`customerId` spelling) directly, and preserves archived records, used and
expired reset tokens, and reserved Phase-7 cart fields verbatim.

## Backups (spec §40)

Honestly: **nothing is configured yet.** No production database exists —
Neon was not connected in this phase (no credentials were available, and
none were invented). When a Neon project is created, its built-in
point-in-time restore / branching applies from day one and should be
confirmed from the Neon console before the real cutover — do not assume
retention windows; the free tier's PITR window is shorter than paid tiers.
Until then the data of record remains `.data/dev-store.json` with its
existing backup discipline.

## Vercel compatibility (spec §41)

Not deployed. The provider architecture is serverless-ready: PrismaClient
is a cached singleton, the store's process-wide write lock is bypassed
entirely in postgres mode, and no code path touches local disk when
`DATA_PROVIDER=postgres` — except media storage, which is still local by
design (object storage is a later phase, and media serving is the
remaining serverless blocker along with per-process login throttling).
For Vercel + Neon use the **pooled** connection string in `DATABASE_URL`.
