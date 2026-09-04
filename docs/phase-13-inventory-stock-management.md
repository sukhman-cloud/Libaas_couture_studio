# Phase 13 — Inventory & Stock Management Foundation

A stock-tracking foundation for Libaas Couture Studio, built to slot into
the existing checkout/order/cancellation transactions without rewriting
them. Inventory is **one row per product** — this catalog has no
variant/option concept (no size/color splits exist) — and is entirely
**opt-in per product**: every product created before this phase, and any
product an admin never enables tracking for, behaves exactly as it did
before. Purchasability continues to be governed by the existing
`ProductAvailability` enum; inventory is an additional, independent gate
that only applies once tracking is switched on.

## Architecture

```
Product ──1:1── InventoryItem ──1:N── InventoryMovement   (append-only ledger)
```

`InventoryItem` fields: `trackingEnabled`, `quantityOnHand`,
`quantityReserved`, `lowStockThreshold`. `quantityAvailable` is **never a
column** — every reader computes it as `quantityOnHand - quantityReserved`
at read time, so it can never drift from its two inputs.

`InventoryMovement` mirrors the existing `OrderActivity`/`PaymentActivity`/
`ShipmentActivity` pattern exactly: one immutable row per stock-affecting
event, never updated or deleted. Movement types: `initial_stock`,
`restock`, `sale`, `reservation`, `reservation_release`, `adjustment`,
`return`, `damaged`, `correction`.

## Stock / reserved / available calculation

```
quantityAvailable = quantityOnHand - quantityReserved
```

Both `quantityOnHand` and `quantityReserved` are non-negative, and
`quantityReserved` can never exceed `quantityOnHand` — enforced at three
layers: the application's compare-and-set repository methods
(`adjustOnHand`/`adjustReserved`), and (on Postgres) database CHECK
constraints as a second, storage-level backstop that no application bug
can bypass.

Every quantity change is a **compare-and-set delta**: the caller reads the
current row and submits its exact `quantityOnHand`/`quantityReserved`
back as `expected`; the repository only applies the delta if the row is
unchanged since that read, returning `null` on a mismatch so the caller
can re-read and retry. This mirrors `OrderRepository.transitionStatus`'s
optimistic-concurrency discipline, applied to a quantity delta instead of
a fixed-state transition.

## Reservation policy

Inventory is reserved **the moment an order is created**, inside the same
transaction as `createOrderFromCheckout` — independent of payment status.
A cash-on-delivery order reserves stock exactly like a prepaid one would,
because the studio is committing to fulfil it either way (per the phase
brief's §7: inventory does not depend on payment success).

Reservation is released back to available stock **only when an order is
cancelled**. It is deliberately never released or converted into a `sale`
decrement on any other status transition (confirmed → processing → ready
→ completed): this phase does not yet distinguish "reserved for a live
order" from "sold and shipped" in the ledger — both simply hold the
reservation until cancellation is the one event that frees it. A future
phase that wants to convert a reservation into a hard `quantityOnHand`
decrement on `completed` (or on a shipment "delivered" event) can do so
without changing this policy's shape: it would add a new movement type
and a new call site, not restructure reservation itself.

Shipping status changes never touch inventory (§8 of the brief) — the
shipment domain and the inventory domain are fully independent; nothing
in `src/server/shipping/service.ts` reads or writes inventory.

## Checkout integration

`reserveInventoryForOrder(tx, order, actorUserId?)` is called from inside
`createOrderFromCheckout`'s existing transaction (`src/server/orders/service.ts`),
immediately after the order and its items are written, before the cart is
cleared. For every order line whose product has `trackingEnabled: true`:

1. Check `quantityAvailable >= line.quantity`.
2. If insufficient, the function returns a failure — the caller throws
   `OrderRejection` with reason `insufficient_stock`, which **rolls back
   the entire transaction** (both providers: the JSON store snapshots and
   restores the whole store on any throw; Postgres uses a real
   `$transaction`). No partial order, no partial reservation, per the
   phase brief.
3. If sufficient, `adjustReserved` moves the quantity from available into
   reserved, and an `InventoryMovement` (type `reservation`) is recorded.

Untracked lines (no `InventoryItem` row, or `trackingEnabled: false`) are
skipped entirely — no gate applies to them, matching every product's
behavior before this phase.

The customer-facing cart and checkout views (`src/server/commerce/service.ts`,
`src/server/checkout/service.ts`) also surface a live `insufficientStock`
flag per line and an `insufficient_stock` checkout-readiness state, so a
customer sees the problem before attempting to place an order — but this
is advisory; the checkout-time re-check inside the transaction is the
actual authority (§14 of the brief: the cart's snapshot is never trusted
as a guarantee).

## Cancellation integration

`releaseInventoryForOrder(tx, order, actorUserId?)` is called from inside
`transitionAdminOrder`'s existing transaction (`src/server/orders/admin.ts`)
whenever the target status is `cancelled`, immediately after the order's
own status CAS succeeds. For every line that has a matching `reservation`
movement on this order, it moves the quantity back out of reserved and
records a `reservation_release` movement. Lines that were never reserved
(untracked products) are skipped — nothing to double-release.

## Concurrency strategy

No new concurrency abstraction was introduced (§15 of the brief — reuse
what exists):

- **Reservation happens inside the checkout transaction**, so it shares
  the customer's domain lock (`withLock(customerLockKey(...))`, taken
  *outside* the transaction, per the existing deadlock rule) and the
  transaction's own atomicity.
- **Release happens inside the cancellation transaction**, alongside the
  order's own status CAS.
- **The quantity CAS** (`adjustOnHand`/`adjustReserved`) is the same
  compare-and-set pattern `OrderRepository.transitionStatus` uses: read,
  compute, write-if-unchanged, retry-or-fail on mismatch. On Postgres this
  is a single `UPDATE ... WHERE id = ? AND quantity_on_hand = ? AND
  quantity_reserved = ?` statement (`$executeRaw`, parameterized — never
  string-interpolated), so the check-and-write is atomic at the SQL level
  even without an explicit application lock.
- **Two customers racing the last unit**: whichever transaction's CAS
  commits first wins; the second re-reads inside the same transaction,
  sees the now-lower `quantityAvailable`, and fails with
  `insufficient_stock` — the whole order transaction rolls back, so the
  loser's order is never created at all (not created-then-cancelled).
- **Two admin stock adjustments racing**: `adjustStock` re-reads the
  current row inside its own transaction and applies the same CAS; a
  losing concurrent adjustment returns "Stock changed since this page
  loaded. Refresh and try again." rather than silently overwriting.
- **Cancellation racing checkout**: both go through the store's normal
  transaction serialization (the JSON provider's single process-wide
  write lock; Postgres's transaction isolation), so they cannot interleave
  mid-write.

## Idempotency

Every inventory-mutating operation is safe against retries (§16 of the
brief):

- **Reservation**: keyed `reserve:<orderId>:<orderItemId>`, unique per
  `(inventoryItemId, idempotencyKey)` — a retried/replayed order-creation
  attempt (e.g. the existing checkout idempotency-key replay path) can
  never double-reserve; the repeat movement insert is rejected and the
  function treats the existing reservation as already-applied.
- **Release**: keyed `release:<orderId>:<orderItemId>` — distinct from the
  reserve key, so releasing twice (a retried cancellation request) is a
  safe no-op.
- **Admin manual adjustments**: the admin form mints a fresh idempotency
  key per page render (mirroring the checkout confirm form's pattern), so
  a double-click or browser retry submits the same key twice and the
  second submission is a safe no-op rather than a double adjustment.
- **Sale/return movements**: not yet produced by any code path in this
  phase (see "deferred" below) — the movement type and its shape exist so
  a future phase has somewhere correct to write them, following the same
  idempotency-key discipline.

## Low-stock behavior

Each `InventoryItem` carries its own `lowStockThreshold` (admin-editable,
default 0). The admin inventory list and detail pages classify every
tracked product into one of: **healthy** (available > threshold),
**low** (`0 < available <= threshold`), **out of stock** (`available <= 0`),
or **not tracked**. The exact threshold value and reserved/on-hand
counts are admin-only — never sent to a customer response.

Customers see only a bucketed label (`customerStockLabel`): `"in_stock"`,
`"limited"`, or `null` (untracked — no inventory-driven message at all).
No exact quantity, no reserved count, no threshold is ever exposed to a
customer-facing page or API — only the product page's existing
`ProductAvailability`-driven badge, with an additional "Limited
availability" or "Out of stock" badge when tracking says so.

## Backward compatibility

Every product created before this phase has no `InventoryItem` row.
`getInventoryLevel` returns `null` for it, `hasSufficientStock` returns
`true` (no gate), `customerStockLabel` returns `null` (no stock message
rendered), and cart/checkout never flag it as insufficient. **Nothing
about an existing product's availability changes** until an admin
explicitly opts it into tracking from its inventory detail page. No stock
quantity is ever fabricated for a product that has never been tracked.

If tracking is later disabled for a previously-tracked product, its
`InventoryItem` row and movement history are preserved (never deleted) —
only the checkout-time gate stops applying; quantities remain visible on
the admin detail page for reference.

## JSON store / PostgreSQL parity

Both providers implement the same two repositories (`inventoryItems`,
`inventoryMovements`) behind the existing `StoreRepositories` interface.

- **JSON store**: `STORE_VERSION` bumped 9 → 10; `DataStore`,
  `emptyStore()`, and `STORE_COLLECTION_KEYS` all gained the two new
  collections — a store opened at an older version upgrades through the
  existing `migrateStore()` and gets both as empty arrays automatically,
  with no conversion needed (every existing product simply has no row,
  which is the correct default). `inventoryItems.create` enforces
  one-row-per-product uniqueness inside the same guarded critical section
  every other one-per-parent repository (payments, shipments) uses.
  `adjustOnHand`/`adjustReserved` are guarded critical sections that
  re-check both quantities against `expected` before writing.
- **PostgreSQL**: new `InventoryItem`/`InventoryMovement` Prisma models
  plus an `InventoryMovementType` enum (migration
  `20260904150000_inventory_foundation_phase_13`), mapper functions in
  `src/server/data/postgres/mappers.ts`, and repository implementations in
  `src/server/data/postgres/provider.ts`. The migration SQL was verified
  column-for-column against `prisma migrate diff --from-empty` before
  being committed by hand (Prisma 6.19's schema language has no `@@check`
  attribute, so the non-negativity and `reserved <= on_hand` constraints
  are hand-appended `CHECK` constraints in the migration, following the
  same pattern earlier phases used for text-length constraints).
- **Migration/verify/export tooling**: `scripts/lib/db-to-store.mjs` (and
  its three consumers — `migrate-to-postgres.mjs`, `verify-migration.mjs`,
  `export-postgres-store.mjs`) now read/write/verify both new tables,
  following the exact pattern Phase 12 established when it closed the
  equivalent gap for payments and shipments.
- **Validation tooling**: `scripts/validate-store.mjs` checks both
  collections — ids, timestamps, non-negative quantities,
  `reserved <= on_hand`, orphan references to products/orders/users,
  movement-type vocabulary, and `(inventoryItemId, idempotencyKey)`
  uniqueness for movements that carry one.

## Variant strategy

This catalog has no variant/option concept today (confirmed: no
size/color splits exist anywhere in the schema or domain types).
Inventory is therefore keyed 1:1 on `productId`. If a future phase
introduces variants, the natural extension is: add a `variantId` column
to `InventoryItem` (nullable, defaulting to the whole-product row when
absent), move the unique constraint to `(productId, variantId)`, and key
`InventoryMovement` the same way — no other part of this foundation
(reservation, release, the CAS pattern, the ledger shape) needs to change
shape to support that.

## Security

- Every inventory mutation (`adjustAdminStock`, `setAdminInventoryTracking`)
  requires `authorizeAdmin("inventory.write")`; every admin read
  (`listAdminInventoryPage`, `getAdminInventoryDetailPage`) requires
  `requireAdminSession()` + `hasPermission(role, "inventory.read")` —
  both permissions already existed in the role matrix (owner and manager
  have both; tailor has read-only; staff has neither), unused until this
  phase.
- No customer-facing code path can create, adjust, or view raw inventory
  quantities — `getInventoryLevel`/`customerStockLabel` are the only
  inventory reads customer pages call, and they return a bucketed label
  or `null`, never a number.
- The acting admin's identity always comes from the verified session
  (`auth.session.sub`), never from a form field — matching every other
  admin action in this codebase.
- No client-controlled stock or reservation state exists: `quantityChange`
  is validated server-side (non-zero integer, capped at a sane bound),
  and every quantity that ends up in a movement or item row is either
  server-computed (reservation/release) or an admin-typed adjustment
  amount, never trusted from a customer request.
- No supplier or private operational information is exposed to customers
  — `reason`, `actorUserId`, and `orderId` on a movement are admin-only
  fields, never rendered on any customer page.

## Intentionally deferred

Per the phase brief, none of the following exist in this codebase:

- Supplier management or purchase orders.
- Warehouse management or multi-location stock.
- Barcode scanning or POS integration.
- Automatic supplier ordering or real-time warehouse synchronization.
- A full returns/refunds workflow — the `return` movement type exists in
  the vocabulary and schema so a future phase has a correct place to
  record one, but nothing in this phase creates a `return` movement
  automatically or processes a refund.
- Converting a `completed` order's reservation into a `sale` decrement —
  the `sale` movement type exists in the vocabulary for the same reason,
  but no code path produces one yet (see "reservation policy" above).
- Vercel deployment.
- Phase 14 or anything beyond this phase's scope.

## Validation performed

- `npx tsc --noEmit` — passes with no errors.
- `npx prisma validate` — schema valid.
- `npx prisma generate` — client regenerated with the new models.
- `npx prisma migrate diff --from-empty --to-schema-datamodel` — confirmed
  the hand-written migration's tables/columns/indexes/enum match what
  Prisma itself would generate from the schema.
- `npm run validate:store` — passes against the real `.data/dev-store.json`
  (untouched) with the new inventory checks included, store now at v10.
- `npm run lint` — passes (two pre-existing unrelated warnings elsewhere
  in the codebase, not touched by this phase).
- `npm run build` — production build succeeds.
- Migration/verify/export scripts extended and syntax-checked
  (`node --check`); not run against a live database, since none was
  created or reset for this phase (consistent with the phase brief's "do
  not reset databases" instruction — no Postgres instance exists in this
  environment to migrate against).
- No automated test framework exists in this repository — reported
  honestly rather than fabricating a test run, matching every prior
  phase's precedent. Manual reasoning-through of the concurrency/
  idempotency paths is documented above in lieu of an integration test
  suite.
