# Database Migration Plan

Target: replace the JSON file provider with PostgreSQL, behind the existing
repository interfaces, without losing a single record.

**Nothing in this document is implemented yet.** No database driver, ORM or
object-storage SDK is installed. This is the plan the migration phase will
follow.

Status of this document: written during Phase 5B (pre-database hardening),
after the Phase 5A infrastructure audit.

---

## 1. Ownership model — read this first

The single most dangerous thing about this codebase's data model was a naming
mistake, corrected in store version 4:

> Carts, wishlists and measurement profiles are owned by a **User**, never by a
> **CustomerProfile**.

The field used to be called `customerId` while holding a `User.id`. It is now
called `userId` and the repository methods are `getByUserId` /
`listByUserId`. Every authorization check in the application compares against
`getCustomerUser().id`, which is a `User.id` — so the User is, and always was,
the real owner.

`CustomerProfile` is a *satellite* of `User` (one row, holding addresses and
marketing preferences). It is not the ownership anchor. Only
`CustomerProfile.addresses` hangs off the profile.

**When writing the SQL schema: every ownership foreign key points at
`users(id)`.** Pointing any of them at `customer_profiles(id)` would silently
detach every cart, wishlist and measurement profile from its owner.

---

## 2. Embedded-array audit

The JSON store nests child rows inside their parents. Postgres cannot filter,
constrain or index inside a nested array usefully, but not everything needs
normalizing — a value that is only ever read and written as a whole unit is
better off as JSONB.

The rule applied below: **normalize when the child has its own identity, its own
lifecycle, or is referenced/queried independently. Keep as JSON when it is an
attribute bag that only ever travels with its parent.**

| Field | Decision | Why |
| --- | --- | --- |
| `CustomerProfile.addresses` | **Normalize** → `customer_addresses` | Each address has its own id, is created/edited/deleted independently, and is referenced by `defaultAddressId`. Orders will reference an address too. |
| `Cart.items` | **Normalize** → `cart_items` | Each line has an id, a price snapshot, a quantity constraint (1–20) and a uniqueness rule on (cart, product, configuration). Changing one line currently rewrites the whole cart. |
| `Wishlist.items` | **Normalize** → `wishlist_items` | Same reasoning; needs a unique constraint on (wishlist, product) that the app currently enforces in code. |
| `Product.media` | **Normalize** → `product_media` | Rows have ids, an explicit `sortOrder`, and an `isPrimary` flag that needs a "exactly one per product" constraint. They also reference `media_assets`, so a foreign key belongs here. |
| `Product.collectionIds` | **Normalize** → `product_collections` join table | A genuine many-to-many. Collection pages query "products in this collection", which is a join, not an array scan. |
| `Product.secondaryCategoryIds` | **Normalize** → `product_categories` join table | Same: category pages match a product by primary *or* secondary category. |
| `MeasurementProfile.values` | **Keep as JSONB** | Deliberately open-ended — the domain comment says unknown keys must be allowed so new garment fields never need a schema change. Values are always read and written as a complete set, never queried individually. A child table would buy nothing and cost a join on every read. |
| `Product.attributes` | **Keep as JSONB** | Small fixed-ish bag (fabric, colour, occasion, work, fit) plus a free-form `extra`. Filtering is exact-match on a handful of keys, which a GIN index on JSONB handles well. Promote individual keys to real columns only if they later need range queries or foreign keys. |
| `Product.tags` | **Keep as `text[]`** | Free-form labels with no identity of their own and no separate lifecycle. Postgres arrays with a GIN index give exactly the `tag = ?` filter the catalog already uses. A `tags`/`product_tags` pair would add two tables to model a list of strings. Revisit only if tags need renaming across products or their own metadata. |
| `Order.items` (future) | **Normalize** → `order_items` | Financial records. Every line needs its own row, its own price snapshot and its own foreign keys. |

---

## 3. Table plan

Money is always `BIGINT` holding **paise**. See section 6.
All primary keys are `UUID` and are **imported verbatim** from the JSON store —
never regenerated.
All timestamps are `TIMESTAMPTZ`, imported from the existing ISO-8601 strings.

### Identity

```sql
users
  id                UUID        PK
  kind              TEXT        NOT NULL   CHECK (kind IN ('customer','admin'))
  name              TEXT        NOT NULL
  email             TEXT        NULL
  phone             TEXT        NULL
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE
  created_at        TIMESTAMPTZ NOT NULL
  updated_at        TIMESTAMPTZ NOT NULL
  UNIQUE INDEX users_email_lower_key ON (LOWER(email)) WHERE email IS NOT NULL
  INDEX ON (kind)

auth_credentials
  id                UUID        PK
  user_id           UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE
  password_hash     TEXT        NOT NULL          -- opaque scrypt string, never re-hashed
  session_version   INTEGER     NOT NULL DEFAULT 1 CHECK (session_version >= 1)
  created_at        TIMESTAMPTZ NOT NULL
  updated_at        TIMESTAMPTZ NOT NULL
  UNIQUE (user_id)                                -- exactly one credential per user

password_reset_tokens
  id                UUID        PK
  user_id           UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE
  token_hash        TEXT        NOT NULL          -- SHA-256 hex of the raw token
  expires_at        TIMESTAMPTZ NOT NULL
  used_at           TIMESTAMPTZ NULL
  created_at        TIMESTAMPTZ NOT NULL
  UNIQUE (token_hash)
  INDEX ON (user_id)
  INDEX ON (expires_at) WHERE used_at IS NULL     -- drives the cleanup job
```

**`sessions`: intentionally no table.** Sessions are stateless HMAC-signed
cookies carrying `sub`, `ver`, `issuedAt` and `expiresAt`. Revocation already
works through `auth_credentials.session_version`, which is compared on every
request. A session table would only be needed to list or kill individual
devices — a future feature, not a migration requirement.

### Customer

```sql
customer_profiles
  id                  UUID        PK
  user_id             UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE
  default_address_id  UUID        NULL      FK -> customer_addresses(id) ON DELETE SET NULL
  accepts_marketing   BOOLEAN     NOT NULL DEFAULT FALSE
  created_at          TIMESTAMPTZ NOT NULL
  updated_at          TIMESTAMPTZ NOT NULL
  UNIQUE (user_id)

customer_addresses
  id            UUID        PK
  profile_id    UUID        NOT NULL  FK -> customer_profiles(id)  ON DELETE CASCADE
  label         TEXT        NOT NULL  CHECK (label IN ('home','work','other'))
  full_name     TEXT        NOT NULL
  phone         TEXT        NOT NULL
  line1         TEXT        NOT NULL
  line2         TEXT        NULL
  locality      TEXT        NULL
  city          TEXT        NOT NULL
  state         TEXT        NOT NULL
  postal_code   TEXT        NOT NULL
  country       TEXT        NOT NULL DEFAULT 'India'
  INDEX ON (profile_id)
```

`default_address_id` is a deferred/nullable circular reference. Import
addresses first, then set the default in a second pass, or declare the
constraint `DEFERRABLE INITIALLY DEFERRED`.

```sql
measurement_profiles
  id              UUID        PK
  user_id         UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE   -- NOT customer_profiles
  label           TEXT        NOT NULL
  unit            TEXT        NOT NULL  CHECK (unit IN ('cm','in'))
  values          JSONB       NOT NULL DEFAULT '[]'
  fit_preference  TEXT        NULL      CHECK (fit_preference IN ('fitted','regular','relaxed'))
  notes           TEXT        NULL
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE
  archived_at     TIMESTAMPTZ NULL
  created_at      TIMESTAMPTZ NOT NULL
  updated_at      TIMESTAMPTZ NOT NULL
  INDEX ON (user_id) WHERE archived_at IS NULL
  UNIQUE INDEX ON (user_id) WHERE is_default AND archived_at IS NULL
```

### Catalog

```sql
media_assets
  id             UUID        PK
  storage_key    TEXT        NOT NULL           -- opaque; never a path
  original_name  TEXT        NOT NULL           -- display only, never used as a path
  mime_type      TEXT        NOT NULL
  size           BIGINT      NOT NULL CHECK (size >= 0)
  created_at     TIMESTAMPTZ NOT NULL
  UNIQUE (storage_key)

categories
  id           UUID        PK
  slug         TEXT        NOT NULL
  name         TEXT        NOT NULL
  description  TEXT        NULL
  parent_id    UUID        NULL  FK -> categories(id)     ON DELETE RESTRICT
  media_id     UUID        NULL  FK -> media_assets(id)   ON DELETE SET NULL
  sort_order   INTEGER     NOT NULL DEFAULT 0
  status       TEXT        NOT NULL CHECK (status IN ('draft','published','archived'))
  archived_at  TIMESTAMPTZ NULL
  created_at   TIMESTAMPTZ NOT NULL
  updated_at   TIMESTAMPTZ NOT NULL
  UNIQUE INDEX categories_slug_lower_key ON (LOWER(slug))
  INDEX ON (status, sort_order)
  CHECK (parent_id <> id)

collections
  id               UUID        PK
  slug             TEXT        NOT NULL
  name             TEXT        NOT NULL
  description      TEXT        NULL
  cover_media_id   UUID        NULL  FK -> media_assets(id) ON DELETE SET NULL
  sort_order       INTEGER     NOT NULL DEFAULT 0
  status           TEXT        NOT NULL CHECK (status IN ('draft','published','archived'))
  archived_at      TIMESTAMPTZ NULL
  created_at       TIMESTAMPTZ NOT NULL
  updated_at       TIMESTAMPTZ NOT NULL
  UNIQUE INDEX collections_slug_lower_key ON (LOWER(slug))
  INDEX ON (status, sort_order)

products
  id                       UUID        PK
  sku                      TEXT        NOT NULL
  slug                     TEXT        NOT NULL
  name                     TEXT        NOT NULL
  short_description        TEXT        NULL
  description              TEXT        NOT NULL DEFAULT ''
  category_id              UUID        NULL  FK -> categories(id)  ON DELETE RESTRICT
  tags                     TEXT[]      NOT NULL DEFAULT '{}'
  price_amount             BIGINT      NOT NULL CHECK (price_amount >= 0)
  price_currency           TEXT        NOT NULL DEFAULT 'INR' CHECK (price_currency = 'INR')
  sale_price_amount        BIGINT      NULL CHECK (sale_price_amount >= 0)
  sale_price_currency      TEXT        NULL
  status                   TEXT        NOT NULL CHECK (status IN ('draft','published','archived'))
  availability             TEXT        NOT NULL CHECK (availability IN
                                       ('available','made_to_order','out_of_stock','discontinued'))
  is_featured              BOOLEAN     NOT NULL DEFAULT FALSE
  attributes               JSONB       NOT NULL DEFAULT '{}'
  stitching_available      BOOLEAN     NOT NULL DEFAULT FALSE
  customization_available  BOOLEAN     NOT NULL DEFAULT FALSE
  archived_at              TIMESTAMPTZ NULL
  created_at               TIMESTAMPTZ NOT NULL
  updated_at               TIMESTAMPTZ NOT NULL
  UNIQUE INDEX products_sku_upper_key  ON (UPPER(sku))
  UNIQUE INDEX products_slug_lower_key ON (LOWER(slug))
  INDEX ON (status, availability)
  INDEX ON (category_id)
  INDEX ON (COALESCE(sale_price_amount, price_amount))   -- effective price sort/filter
  GIN INDEX ON (tags)
  GIN INDEX ON (attributes)
  CHECK (sale_price_amount IS NULL OR sale_price_amount < price_amount)

product_categories                     -- secondary categories only
  product_id   UUID  NOT NULL  FK -> products(id)   ON DELETE CASCADE
  category_id  UUID  NOT NULL  FK -> categories(id) ON DELETE RESTRICT
  PRIMARY KEY (product_id, category_id)
  INDEX ON (category_id)

product_collections
  product_id     UUID  NOT NULL  FK -> products(id)    ON DELETE CASCADE
  collection_id  UUID  NOT NULL  FK -> collections(id) ON DELETE CASCADE
  PRIMARY KEY (product_id, collection_id)
  INDEX ON (collection_id)

product_media
  id          UUID        PK
  product_id  UUID        NOT NULL  FK -> products(id)     ON DELETE CASCADE
  media_id    UUID        NOT NULL  FK -> media_assets(id) ON DELETE RESTRICT
  alt         TEXT        NOT NULL DEFAULT ''
  sort_order  INTEGER     NOT NULL
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE
  created_at  TIMESTAMPTZ NOT NULL
  UNIQUE (product_id, sort_order)
  UNIQUE INDEX product_media_one_primary ON (product_id) WHERE is_primary
  INDEX ON (media_id)
```

### Shopping

```sql
carts
  id          UUID        PK
  user_id     UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE
  created_at  TIMESTAMPTZ NOT NULL
  updated_at  TIMESTAMPTZ NOT NULL
  UNIQUE (user_id)                                  -- one active cart per user

cart_items
  id                        UUID        PK
  cart_id                   UUID        NOT NULL  FK -> carts(id)    ON DELETE CASCADE
  product_id                UUID        NOT NULL  FK -> products(id) ON DELETE RESTRICT
  quantity                  INTEGER     NOT NULL CHECK (quantity BETWEEN 1 AND 20)
  unit_price_amount         BIGINT      NOT NULL CHECK (unit_price_amount >= 0)
  unit_price_currency       TEXT        NOT NULL DEFAULT 'INR'
  configuration_key         TEXT        NOT NULL DEFAULT ''
  stitching_selected        BOOLEAN     NOT NULL DEFAULT FALSE     -- reserved, Phase 7
  stitching_measurement_id  UUID        NULL  FK -> measurement_profiles(id) ON DELETE SET NULL
  customization_request_id  UUID        NULL                       -- reserved, Phase 7
  notes                     TEXT        NULL
  created_at                TIMESTAMPTZ NOT NULL
  updated_at                TIMESTAMPTZ NOT NULL
  UNIQUE (cart_id, product_id, configuration_key)
  INDEX ON (cart_id)
  INDEX ON (product_id)

wishlists
  id          UUID        PK
  user_id     UUID        NOT NULL  FK -> users(id)  ON DELETE CASCADE
  created_at  TIMESTAMPTZ NOT NULL
  updated_at  TIMESTAMPTZ NOT NULL
  UNIQUE (user_id)

wishlist_items
  id           UUID        PK
  wishlist_id  UUID        NOT NULL  FK -> wishlists(id) ON DELETE CASCADE
  product_id   UUID        NOT NULL  FK -> products(id)  ON DELETE RESTRICT
  created_at   TIMESTAMPTZ NOT NULL
  UNIQUE (wishlist_id, product_id)
  INDEX ON (wishlist_id)
```

Not modelled yet, by instruction: `orders`, `order_items`, `payments`,
`appointments`, `alterations`, `quotes`, `customization_requests`, `reviews`,
`notifications`, `staff`, `roles`, `permissions`, `audit_logs`.

---

## 4. Foreign-key summary

| Parent | Child | FK | On delete | Rationale |
| --- | --- | --- | --- | --- |
| users | auth_credentials | user_id | CASCADE | The credential has no meaning without the user. |
| users | password_reset_tokens | user_id | CASCADE | Same. |
| users | customer_profiles | user_id | CASCADE | Same. |
| users | measurement_profiles | user_id | CASCADE | Personal data; must not outlive the account. |
| users | carts | user_id | CASCADE | Same. |
| users | wishlists | user_id | CASCADE | Same. |
| customer_profiles | customer_addresses | profile_id | CASCADE | Addresses belong to the profile. |
| customer_addresses | customer_profiles.default_address_id | — | SET NULL | Deleting the default address must not delete the profile. |
| categories | categories | parent_id | RESTRICT | A parent with children must be re-parented, not silently orphaned. |
| categories | products | category_id | RESTRICT | Archive a category; never delete one that products point at. |
| categories | product_categories | category_id | RESTRICT | Same. |
| collections | product_collections | collection_id | CASCADE | Deleting a collection only dissolves membership. |
| products | product_media | product_id | CASCADE | Gallery rows belong to the product. |
| media_assets | product_media | media_id | RESTRICT | Never orphan a gallery row; detach it first. |
| media_assets | categories.media_id / collections.cover_media_id | — | SET NULL | Cover art is decorative. |
| carts | cart_items | cart_id | CASCADE | Lines belong to the cart. |
| wishlists | wishlist_items | wishlist_id | CASCADE | Same. |
| products | cart_items / wishlist_items | product_id | **RESTRICT** | A product that is in someone's cart must be archived, never hard-deleted. This is the rule that protects future order history too. |

**Deletion policy in one line:** products, categories and collections are never
hard-deleted by the application — `status = 'archived'` plus `archived_at` is
the delete. RESTRICT exists to make an accidental hard delete fail loudly.

---

## 5. Archive / soft-delete semantics

The current behaviour must survive migration unchanged:

- `status = 'archived'` hides a product, category or collection from every
  customer-facing query and from the default admin list, but the row stays.
- `archived_at` records when.
- `MeasurementProfile.archived_at` soft-deletes a measurement set; archived
  profiles are hidden from the customer but preserved, because future orders
  will reference the measurements used.
- `User.is_active = false` is account deactivation. The row, its credential and
  all its data are preserved.
- Publication status is **independent of availability**: a product can be
  `published` and `out_of_stock`, or `draft` and `available`. Do not collapse
  these into one column.

Because measurements are soft-deleted and can be edited, **a future order must
snapshot the measurement values it was made with**, not merely store a foreign
key. The same principle already applies to cart price snapshots.

---

## 6. Money

Every monetary value is an **integer count of paise**. ₹1 = 100 paise.

- Column type: `BIGINT`. Never `FLOAT`, `REAL`, `DOUBLE PRECISION` or `MONEY`.
- `NUMERIC(12,2)` is also rejected: it invites decimal rupees back into the
  model, and the whole application — snapshots, subtotals, line totals — is
  written in whole paise.
- Currency is stored alongside as `TEXT` fixed to `'INR'`, matching the `Money`
  type in the domain model, so a second currency later is an additive change.
- Every money column carries `CHECK (col >= 0)`.
- Rupee ↔ paise conversion happens only at the edges: form input parsing and
  display formatting. Nothing in between ever sees a decimal.

---

## 7. Slug / SKU constraints and case normalization

| Value | Stored as | Uniqueness | Comparison |
| --- | --- | --- | --- |
| Product SKU | as entered by the admin | `UNIQUE (UPPER(sku))` | case-insensitive |
| Product slug | lowercase, URL-safe | `UNIQUE (LOWER(slug))` | case-insensitive |
| Category slug | lowercase, URL-safe | `UNIQUE (LOWER(slug))` | case-insensitive |
| Collection slug | lowercase, URL-safe | `UNIQUE (LOWER(slug))` | case-insensitive |
| User email | lowercased and trimmed on write | `UNIQUE (LOWER(email))` | case-insensitive |

The application already normalizes on write and compares case-insensitively;
the expression indexes make the database agree. This is a real change in
guarantee: today uniqueness is a read-then-write check under an in-process
lock, which is racy across instances. In Postgres it becomes an actual
constraint, and the application's existing "already in use" error is raised
from the constraint violation instead.

`UNIQUE (LOWER(email))` is used rather than the `citext` extension so the
schema needs no extension privileges.

---

## 8. Authentication migration

| Item | How it migrates |
| --- | --- |
| Password hashes | Copied **verbatim** as opaque text. Never re-hashed, never reset, never validated beyond the `scrypt$` prefix. The existing scrypt verifier keeps working because the parameters are encoded inside each hash string. |
| Session state | Nothing to migrate — sessions are stateless signed cookies. Existing sessions keep working through the migration as long as `SESSION_SECRET` does not change. |
| `sessionVersion` | Migrates as an integer column. Do not reset it: resetting would silently invalidate every signed-in device. |
| Password reset tokens | Migrate unused, unexpired rows only. Used and expired rows may be dropped — record the counts in the migration report. |
| Account deactivation | `is_active` boolean, migrated as-is. |
| Admin authentication | **Does not migrate — it does not exist as data.** Admin login is an environment-variable password gate with a hardcoded session subject and role. Converting it to a real admin `User` row with a role is its own phase and is a prerequisite for staff, permissions and audit logs. |
| Email delivery | Still a console provider. Reset links are printed to the server log and are not delivered. A real provider is required before production. |

`SESSION_SECRET` must be treated as a migration-critical secret: changing it
logs everyone out. Rotate it deliberately, not as a side effect of setting up a
new environment.

---

## 9. Login throttling

Today both limiters are plain objects in one Node process:

- customer login: a `Map` keyed by email, 8 failures then a 60-second lockout;
- admin login: a single global counter, 5 failures then a 60-second lockout.

**Why this is unsafe on serverless:** each instance has its own copy. With *n*
warm instances the effective budget is *n* × the limit, and an attacker who
triggers cold starts is effectively unthrottled. A restart also clears every
lockout. Neither limiter can see the others.

**Not implemented in this phase, by instruction.** The future approach, chosen
once the infrastructure is fixed:

1. *Database-backed* — a `login_attempts` table keyed by identifier, incremented
   in the same transaction as the login attempt. Simplest, no new dependency,
   correct across instances; costs a write per failed attempt.
2. *Provider-backed* — a managed rate limiter (e.g. an edge KV with an atomic
   counter). Fastest and does not touch the primary database; adds a dependency.
3. *Distributed* — Redis-style sliding window. Most flexible, most operational
   overhead. Only worth it if other rate limits appear.

Recommendation to revisit at migration time: start with (1), because the
database will already be there, the volume is tiny for a single boutique, and it
keeps the lockout in the same transactional world as the credential it protects.
Add a per-IP dimension alongside the per-email one at the same time.

---

## 10. Vercel blockers

What currently prevents a production deployment, in priority order.

| Blocker | Why it fails | Resolution |
| --- | --- | --- |
| JSON persistence | Writes to an ephemeral, per-instance filesystem. Data is lost on redeploy and never shared between instances. | This migration. |
| Local media storage | Same filesystem; uploaded images 404 from any other instance. | Object storage behind the existing `StorageProvider`. |
| In-memory locks | `withLock` is per-process. It is the only guard against duplicate signups and double-spent reset tokens. | Database transactions + unique constraints. |
| Login throttling | Per-process counters. | Section 9. |
| Environment configuration | `SESSION_SECRET` is optional and `NEXT_PUBLIC_SITE_URL` silently defaults to `localhost`, which would put localhost links in password-reset emails. | Require both when `NODE_ENV=production`. |
| Email delivery | Console provider only. | Real provider before launch. |
| Session persistence | **Not a blocker** — stateless signed cookies work correctly on serverless. | None. |
| Caching / revalidation | **Not a blocker** — only `revalidatePath` is used, no stale route config. | None. |
| Server actions / API routes | **Not a blocker** apart from `/api/media/[id]` inheriting the filesystem problem. | Follows the media fix. |
| Node version | No `engines` field, so the runtime is unpinned. | Pin it at migration time. |

---

## 11. Migration sequence

```text
Back up the JSON store (outside the project directory)
        ↓
Validate it            node scripts/validate-store.mjs
        ↓
Create the database + run schema migrations (on a branch first)
        ↓
Import identity        users → auth_credentials → password_reset_tokens
        ↓
Import customer data   customer_profiles → customer_addresses → default_address_id
                       → measurement_profiles
        ↓
Import catalog         media_assets → categories → collections → products
                       → product_categories → product_collections → product_media
        ↓
Import shopping        carts → cart_items → wishlists → wishlist_items
        ↓
Validate counts and relationships (inside the same transaction)
        ↓
Run the application test suites against the database provider
        ↓
Switch DATA_PROVIDER
```

Import order is dependency order: nothing is inserted before its parent exists.

### The importer must fail — not repair — when it finds

- a duplicate primary key;
- a duplicate slug, SKU, or email (case-insensitively);
- a foreign key that resolves to nothing (missing user, product, category,
  collection or media asset);
- an ownership id that is a `CustomerProfile.id` where a `User.id` is required;
- a non-integer, negative, or non-INR money value;
- a sale price that is not below its base price;
- a cart quantity outside 1–20;
- a product with media rows but no primary image, or more than one primary;
- a media reference with no corresponding asset row.

`scripts/validate-store.mjs` already detects every one of these against the
JSON store, read-only, before anything is created. Run it first; the importer
repeats the same checks inside the transaction as a second gate.

### Safety rules

- **Refuse to run against a non-empty database** unless explicitly forced.
- **Dry run by default** — validate and report, write nothing.
- **One transaction** — a partial import must be impossible.
- **Never regenerate ids.** Every id in the JSON store is already a UUID.
- **Never re-hash passwords.**
- **Import archived rows too.** Archived products, categories, collections and
  measurement profiles are history, not rubbish.
- **Keep the JSON file.** Archive it; it is the rollback path until the database
  has been running on real data with real backups for a meaningful period.

---

## 12. Rollback

The migration is one-way in the sense that it creates data, but reversible in
the sense that nothing is destroyed:

1. The JSON store is untouched by the importer (it is opened read-only).
2. `DATA_PROVIDER=file` switches the application straight back to it.
3. Any writes made while the database was live would be lost on rollback — so
   the switch-over should happen at a quiet moment, and the window before
   committing to the database should be short.

Down-migrations of the SQL schema itself are handled by the migration tool once
one is chosen; before any destructive schema change, take a snapshot.

---

## 13. Operations that must become atomic

`repos.transaction(fn)` exists, and as of **Phase 5C the identity operations
now use it**. The catalog and shopping rows below are still unwrapped. This is
the list, worst first, with what a partial failure costs.

### Identity — DONE in Phase 5C

| Operation | Writes | Partial-failure cost that is now closed |
| --- | --- | --- |
| **`signupCustomer`** | `users.create` → `credentials.create` → `customers.create` | **Permanent broken account.** Failing after the first write left a User with no credential: login impossible, and because the duplicate-email check matched, that email could never be registered again — with no delete method anywhere in the app to clear it. Failing after the second left an account that logs in but has no profile, dead-ending every address/marketing/measurement action on "Profile not found." All three inserts and the duplicate check now run in one transaction. |
| **`resetPassword`** | `passwordResetTokens.markUsed` → `credentials.update` | The token is burnt first (correct, for single-use safety), but if the credential write then failed the link was dead and the password unchanged. Both writes are now one unit, so the token can never be consumed without the password actually changing. |
| **`deactivateAccount`** | `users.update` (isActive) → `credentials.update` (sessionVersion) | Two writes describing one decision. Now one transaction, so the account can never rest deactivated-with-live-sessions or signed-out-but-active. |
| **`changePassword`** | `credentials.update` | Single write, but the verify→rotate sequence spanned ~100 ms of scrypt with no lock. Now serialized and re-read; see §13a. |
| **`updateProfile`** | `users.update` | Single write of a row a deactivation also writes, from a snapshot taken before the lock. Now re-read inside the transaction; see §13a. |

### Catalog operations

| Operation | Writes | Cost |
| --- | --- | --- |
| Delete product media | storage delete → `media.delete` → `products.update` | An orphan file or a gallery row pointing at nothing. |
| Attach media | `media.create` → `products.update` | An uploaded asset referenced by no product. |
| Archive category/collection | status update → dependent product updates | Products left pointing at an archived parent mid-way. |

### Shopping operations

| Operation | Writes | Cost |
| --- | --- | --- |
| First add to cart | `carts.create` → `carts.update` | An empty cart row. Self-healing: the next add finds it and updates. |
| First add to wishlist | `wishlists.create` → `wishlists.update` | Same. |

Note: `ensureCart` and `ensureWishlist` call `getRepositories()` internally.
To take part in a transaction they must accept the transaction's repositories
as an argument instead. That is a small signature change, listed in the
checklist below.

### Future — orders

The shape the abstraction exists for:

```ts
transaction(async (tx) => {
  const order = await tx.orders.create(...)        // header
  for (const line of lines) await tx.orderItems.create(...)
  await tx.payments.create(...)                    // pending payment
  await tx.carts.update({ ...cart, items: [] })    // empty the cart
})
```

An order that half-exists is the failure this whole phase is meant to prevent,
which is why the database foundation comes before checkout rather than after.

### 13a. Account concurrency — CLOSED in Phase 5C

The store lock makes each write atomic, but it could not fix callers that
disagreed about their own lock key. Before Phase 5C, three actions mutated the
same `users` / `auth_credentials` rows under three different regimes:
`updateProfile` took `customer:<id>`, `changePassword` and `deactivateAccount`
took **no lock at all**, and `resetPassword` took `reset:<tokenHash>`.

Two consequences, both reproduced under test before they were fixed:

1. Two concurrent credential mutations (a change-password racing a
   deactivation, or two change-passwords) each read the same `sessionVersion`
   and both wrote `n + 1`, so one bump was lost and a session that should have
   been revoked survived.
2. `updateProfile` spread a `user` object captured *before* taking its lock, so
   it could write `isActive: true` back over a concurrent deactivation —
   reviving a deactivated account.

**What Phase 5C changed**

- One key for the whole account: `customerLockKey(userId)` in
  `src/server/lock.ts`. Every account and commerce mutation uses it, including
  `resetPassword`, which no longer keys on the token hash.
- `mutateAccount` in `src/server/account/security.ts` is the one seam for
  security-sensitive account writes: domain lock → store transaction →
  **re-read** User and AuthCredential → run the callback → single atomic
  commit. The re-read is what makes stale snapshots structurally impossible;
  the lock alone never could, because the stale read happened before it.
- `sessionVersion` is enforced monotonic **at the storage seam**
  (`CredentialRepository.update` rejects a lower value), so the invariant does
  not depend on every caller getting the arithmetic right.

**What the PostgreSQL provider must reproduce**

| Guarantee | JSON provider today | Postgres equivalent |
| --- | --- | --- |
| One writer per account | `withLock(customer:<id>)`, a Map in one process | `SELECT … FOR UPDATE` on the `users` row, or `SERIALIZABLE` with retry |
| Fresh read inside the unit | re-read inside `transaction()` | the same read, inside `BEGIN` |
| All-or-nothing commit | snapshot + one atomic file replace | `BEGIN` / `COMMIT` / `ROLLBACK` |
| Monotonic `sessionVersion` | precondition in `credentials.update` | `CHECK`-style trigger, or `UPDATE … WHERE session_version <= $1` |
| Single-use reset token | authoritative re-read inside the transaction | `UPDATE … WHERE used_at IS NULL RETURNING *` |

The application code does not change when that swap happens — `mutateAccount`
keeps the same shape and the guarantee only strengthens, because the lock stops
being process-local.

**Honest limits of what ships today.** The lock is a `Map` in one Node process
and the transaction is a snapshot plus one atomic file replace. Together they
are correct for the single long-lived server this project runs, and they are
**not** multi-process isolation: a second process pointed at the same JSON file
would not observe the lock at all, and could still interleave its writes. That
is one more reason this app must not go to a serverless platform before the
database migration.

---

## 14. Provider requirements

Recorded here so the choice is made against criteria rather than familiarity.

**Required:** PostgreSQL; transactions; serverless-safe connection pooling;
reviewable migration files; automated backups with point-in-time recovery;
separate development and production databases; data export.

**Wanted:** database branching for rehearsing migrations; a free or low tier
that scales with a single boutique; a region close to India.

Evaluated at audit time — Neon (strongest fit: serverless-native pooling,
branching, generous free tier), Supabase (also strong; bundles object storage,
which could cover media, but ships an auth product this app does not need), and
Vercel Postgres (convenient, Neon underneath, less control). **Nothing is
installed and nothing is chosen yet.**

---

## 15. What must be true before the migration starts

- [x] Ownership fields renamed to `userId` and pointing at users (store v4).
- [x] Identity operations wrapped in `repos.transaction` (Phase 5C).
- [x] Account mutations serialized on one key and re-read inside the
      transaction (Phase 5C) — no stale-snapshot writes remain in auth.
- [x] Prisma schema + committed migrations + PostgreSQL provider behind the
      same repository interfaces (Phase 5D — `docs/phase-5d-database.md`).
- [x] JSON→PostgreSQL import + independent verifier + rollback export
      (Phase 5D; rehearsed against the real store on a local PostgreSQL).
- [ ] Neon project created and `DATABASE_URL` configured (needs the owner —
      no credentials existed at Phase 5D time and none were invented).
- [x] `transaction()` exists on the repository interfaces.
- [x] Corrupt-store handling fails closed instead of starting empty.
- [x] `.gitignore` covers every environment file, every local-database file,
      and the store file by name at any depth — `DATA_DIR` can point the store
      outside `.data/`, so an anchored directory rule alone was not enough.
      The server also writes a self-ignoring `.gitignore` into whatever
      directory `DATA_DIR` resolves to.
- [x] A read-only migration-readiness validator exists.
- [ ] Embedded child rows have their own repositories.
- [ ] Signup and other multi-write operations actually use `transaction()`.
- [ ] `SESSION_SECRET` and `NEXT_PUBLIC_SITE_URL` required in production.
- [ ] Test suites live in the repository and run in CI.
