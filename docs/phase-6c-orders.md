# Phase 6C — Order model & the cart → order transaction

Phase 6C turns the Phase 6A checkout confirmation into a real, persisted
**Order**. One service function — `createOrderFromCheckout` in
[`src/server/orders/service.ts`](../src/server/orders/service.ts) — is the
only way an order comes into being, on both storage providers
(`DATA_PROVIDER=file` and `DATA_PROVIDER=postgres`).

No payment, shipping rates, taxes or coupons exist yet. The order records
explicit **zero** shipping/tax/discount amounts so the total formula
(`total = subtotal + shipping + tax − discount`) holds from day one, and
the customer-facing copy claims only what is true: *"Your order has been
placed"* — no payment taken, the studio confirms payment and delivery.

---

## 1. Schema

Two entities, both in `src/types/domain.ts`, `prisma/schema.prisma`
(migration `20260828110038_orders_phase_6c`) and the JSON store.

**Order** — `id` (UUID), `orderNumber` (unique), `userId` (FK → users,
`ON DELETE RESTRICT`), `status` (`pending`), a **customer snapshot**
(`name`, `email?`, `phone?`), a **shipping-address snapshot** (`fullName`,
`phone`, `line1`, `line2?`, `locality?`, `city`, `state`, `postalCode`,
`country` — deliberately no address id or label), `currency` (`"INR"`),
five money amounts in integer paise (`subtotal`, `shippingAmount`,
`taxAmount`, `discountAmount`, `total`, all `BIGINT` with non-negative
CHECK constraints), `idempotencyKey` + `requestFingerprint` with a
**unique `(user_id, idempotency_key)`** constraint, and app-managed
timestamps.

**OrderItem** — `id`, `orderId` (FK Restrict), `productId` (FK Restrict),
`nameSnapshot`, `slugSnapshot`, `quantity` (CHECK > 0), `unitPrice` and
`lineSubtotal` (integer paise, CHECK ≥ 0), `configurationKey`,
`stitching?` (JSON), `customizationRequestId?`, `notes?`, `position`
(stable ordering).

### Snapshot strategy

An order is a **historical record**, not a view over live data. Product
name/slug/price, the customer's name/email/phone and the full delivery
address are copied into the order at commit time. Verified behaviors:
renaming or archiving the product, changing its price, renaming the user,
or deleting the address afterwards leaves the placed order byte-identical.
`productId` is kept **alongside** the snapshot as a reference
(`ON DELETE RESTRICT`, §7 below).

## 2. Order numbers

`LCS-XXXX-XXXX` from the 32-character alphabet
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no `0/O/1/I` ambiguity), generated
with `crypto.randomBytes`. Non-sequential — order numbers reveal no order
volume and cannot be enumerated (32⁸ ≈ 1.1 × 10¹² combinations). The
creation transaction retries the in-transaction collision check up to
three times; the database unique constraint is the final backstop.

## 3. Idempotency

- The checkout page mints a **server-side UUID key per render**
  (`generateIdempotencyKey()`), carried as a hidden field. Non-UUID keys
  are rejected outright (`invalid_request`).
- `(userId, idempotencyKey)` is unique in storage.
- `requestFingerprint = sha256("v1:" + addressId)` records what the key
  was used for.
- **Replay** (same user, same key, same fingerprint — double-click,
  network retry, refresh of a committed confirmation): the ORIGINAL order
  is returned, outcome `replayed`. Verified through the real HTTP flow
  and under concurrency (two racing same-key submissions → exactly one
  order; in-process the customer lock serializes them, cross-process the
  unique constraint makes the loser look up and return the winner's
  order).
- **Conflicting reuse** (same key, different address): rejected with
  `idempotency_conflict`; no second order is created.
- Keys are scoped per user: another user's key value creates only their
  own order and can never read someone else's.

## 4. The transaction

`createOrderFromCheckout` = `withLock(customerLockKey(userId))` **outside**
→ ONE `repos.transaction` inside (the Phase 5C discipline: domain lock
outside, store transaction inside, every fact re-read within it):

1. Idempotency lookup — replay / conflict short-circuit.
2. Re-read the user — must still be an active customer.
3. `validateCheckoutAddress` against transaction-scoped repositories —
   the same single implementation checkout rendering uses, injected via
   its `repos` parameter (ownership + schema validity re-checked in-tx).
4. Re-read the cart — empty ⇒ `cart_empty`. Per line: integer quantity in
   `1..MAX_QUANTITY_PER_ITEM`, product published & purchasable,
   currency `INR`, and the line's snapshot price **equal** to the
   product's current effective price (`price_changed` in either
   direction — nothing is silently re-priced).
5. Totals summed in integer paise with explicit zero
   shipping/tax/discount; safe-integer guarded.
6. Order number minted (collision-checked ×3).
7. `orders.create` + cart cleared — **same unit**. Any failure rolls the
   whole transaction back: no partial order, the cart untouched.

The browser contributes exactly two values — the address id and the
(server-minted) idempotency key. Prices, totals, quantities, product ids
and ownership sent by a form are never read; the E2E suite submits forged
`price/subtotal/total/quantity/productId/userId` fields and the order
still commits at the server-computed amounts.

Failures map to a typed, customer-safe result union
(`created` / `replayed` / `rejected(reason)` / `failed`); raw errors are
logged server-side only.

## 5. Success page

`/checkout/complete?order=LCS-…` loads via `getOwnOrderByNumber` — a
format-validated, **ownership-scoped** lookup. A foreign, unknown or
missing order number behaves identically (redirect to `/cart`), so order
numbers reveal nothing. The page shows the placed order (items, subtotal,
"Delivery — confirmed by the studio", total, address snapshot, `Pending`
badge) and states that no payment has been taken online.

## 6. Status roadmap

`OrderStatus` currently has the single value `pending` (a placed order
awaiting the studio's confirmation). The enum is deliberately minimal —
statuses like `confirmed`, `in_progress`, `ready`, `delivered`,
`cancelled` will be added by later phases *when the flows that set them
exist*, never before.

## 7. Decision: `productId` keeps `ON DELETE RESTRICT`

Order items reference their product with `ON DELETE RESTRICT` (not
`SET NULL`): the catalog already uses **soft deletion** (archiving), so
hard-deleting a product that has been ordered should be impossible — the
order's snapshot fields make it self-contained either way, and the
restrict constraint preserves the reference's integrity for future admin
tooling ("show orders for this product").

## 8. Phase-7 note — measurements & configuration

Cart lines already reserve `configurationKey` / `stitching` /
`customizationRequestId` / `notes`, and order items snapshot them
verbatim. Today no client path can set them (they are always empty), so
they carry no attack surface. **When Phase 7 adds stitching
configuration, two things become mandatory at cart-configure time:**
validate `measurementProfileId` ownership (the profile must belong to the
cart's owner), and decide the measurement snapshot strategy — the
measurement VALUES must be snapshotted into the order (or an immutable
profile version referenced) so later edits to a profile cannot alter what
a placed order recorded.

## 9. Testing

- **Unit/integration** (real compiled services, both providers): 80
  assertions on the JSON provider, 77 on PostgreSQL — creation, snapshot
  immutability, idempotency replay/conflict, every rejection reason,
  totals, ownership, order-number format/uniqueness.
- **Concurrency**: same-key race → one order; different-key race → one
  order + `cart_empty`; price-mutation race → the order only ever carries
  the acknowledged snapshot.
- **E2E over HTTP** (production server, MPA form protocol): 32 assertions
  × both providers — forged-field immunity, replay, foreign
  address/order/key isolation, price-change blocking, cart clearing,
  server log hygiene.
- **Browser** (Playwright): 38 assertions — full click-through place-order
  flow, double-click yields one order, stale-tab failure announced in the
  aria-live region, keyboard/focus, axe WCAG A/AA on checkout and success
  pages, 8 viewport widths with no horizontal overflow.
- **Adversarial review**: IDOR, ownership, tampering, idempotency abuse,
  replay, enumeration and leakage scenarios — no confirmed issues; one
  live probe (key reuse with a different address over HTTP) added.
- **Migration pipeline**: `validate-store.mjs`, `migrate-to-postgres.mjs`
  and `verify-migration.mjs` extended to orders/order items; a real
  E2E-produced store round-tripped JSON → PostgreSQL → verified
  field-by-field.
