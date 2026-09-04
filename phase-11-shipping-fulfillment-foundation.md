# Phase 11 — Shipping & Fulfillment Foundation

A shipping/fulfillment domain and state architecture for Libaas Couture
Studio, built to slot into the existing order/payment system without
rewriting it. **No real shipping carrier is connected.** Every shipment
today is admin-entered text (carrier name, tracking reference) and
server-validated status transitions — nothing calls a live shipping API,
computes a real rate, or generates a real label.

## Architecture

A `Shipment` is a separate entity from `Order` and `Payment`, related 1:1
to `Order` by `orderId` (one shipment per order, enforced by a unique
constraint in both the JSON store and Postgres). The delivery address is
**never duplicated** on the shipment — it lives exclusively on
`Order.shippingAddress`, the immutable purchase-time snapshot Phase 6C
already established; every shipment reader re-derives the address from the
order it belongs to.

```
Order ──1:1── Payment    (Phase 10, independent status)
   │
   └──1:1── Shipment ──1:N── ShipmentActivity   (append-only, audit)

ShipmentWebhookEvent   (standalone; dedup key: carrier + providerEventId)
```

Order status, payment status and shipment status are three independent
fields, never overloaded into one: an order can be `processing` while its
payment is `unpaid` and its shipment is `preparing`; a COD order can be
`shipped` while its payment is still `unpaid`; a `failed` payment is never
silently treated as paid, and shipping proceeds or blocks independently of
it (surfaced via fulfillment readiness, not by mutating payment state).

## Shipment statuses

```
not_ready ──▶ preparing ──▶ ready_to_ship ──▶ shipped
   │              │               │              │
   └──────────────┴───────────────┴──▶ cancelled  │
                                                    ├──▶ out_for_delivery ──▶ delivered
                                                    ├──▶ delivered
                                                    └──▶ delivery_failed ──▶ out_for_delivery | returned
                                                         shipped/out_for_delivery ──▶ returned
```

Defined and enforced in `src/server/shipping/workflow.ts`
(`isAllowedShipmentTransition`), mirroring `src/server/orders/workflow.ts`
and `src/server/payments/workflow.ts` exactly. Every mutation path —
`createShipment`, `transitionShipment`, `updateShipmentTracking`, and the
webhook processor — validates the transition server-side before writing.
**No client input can set a shipment status directly**; every write goes
through one of those functions, each of which re-reads the current row
inside a transaction before validating and applying the transition.
Terminal states (`delivered`, `returned`, `cancelled`) allow no further
transitions.

## Shipping methods

`standard | local_delivery | pickup | provider_managed` — a
provider-agnostic vocabulary. `provider_managed` is the reserved slot for
a future real carrier integration; nothing in this phase talks to one.
Admins choose a method when creating a shipment; no live rate is computed
for any of them.

## Order/payment/shipment relationship

Kept strictly separate at every layer:

- **Schema**: `Shipment` and `Payment` are sibling tables, each with their
  own status enum, each foreign-keyed to `orders` independently. Neither
  references the other.
- **Domain types**: `ShipmentStatus` and `PaymentStatus` are distinct
  unions; `Order.status` (`OrderStatus`) is a third, separate union.
- **Service layer**: `computeFulfillmentReadiness` (in
  `src/server/shipping/service.ts`) is the ONE place that reasons about
  all three together — and it is read-only. It never mutates order,
  payment, or shipment state; it returns a `{ ready, blockingReasons }`
  signal the admin UI displays as guidance, not a gate that blocks action.
  A failed payment, a cancelled order, or an open customization request
  each contributes a specific, named blocking reason.

## Fulfillment readiness

`computeFulfillmentReadiness({ order, paymentStatus, customizationStatuses })`
returns:
- `ready: boolean`
- `hasStitchedItems` / `hasCustomization` — informational flags for the
  admin, not blockers by themselves (a stitched order can still be marked
  ready when its stitching is done; this phase does not track a separate
  "stitching complete" state, matching the boutique's actual current
  workflow, which is order-status-driven).
- `blockingReasons: string[]` — cancelled order, failed payment, or open
  (non-terminal) customization requests.

The admin order detail page shows a warning banner with the specific
reasons when an order is not ready; the admin order list shows a compact
"Blocked" indicator per row (computed without the customization check,
which would be an unbounded per-row query across a page — the detail
page's readiness includes it).

**Nothing here auto-changes order, payment, or shipment status.**
Readiness is guidance only; every actual status transition is a deliberate
admin action.

## Tracking information

`updateShipmentTracking` (service) / `updateAdminShipmentTracking` (admin
wrapper) is the admin-only path for recording/updating carrier and
tracking number:

- **Validated & capped**: carrier ≤ 80 chars, tracking number ≤ 100 chars,
  estimated delivery ≤ 80 chars — trimmed, and both the Prisma schema
  (CHECK constraints) and the JSON store's write path enforce the same
  bounds so no oversized value can reach storage via either provider.
- **Clearable**: submitting an empty field explicitly clears it (a
  tri-state patch distinguishes "field not submitted" — leave alone — from
  "field submitted empty" — clear), so a typo can be corrected to blank
  without needing a separate delete action.
- **Audited**: every tracking update writes one `tracking_updated`
  `ShipmentActivity` row (with the new values in safe metadata) plus a
  matching `OrderActivity` summary entry — a correction is visible in
  history, not silently overwritten.
- **Admin-only**: gated by `shipping.write`; no customer-facing action
  exists to set tracking.

## Idempotency & concurrency

- **`createShipment`** — re-reads the order inside a transaction; if a
  shipment already exists for that order, returns the existing record
  (`outcome: "replayed"`) rather than erroring. A cross-process race on the
  same order is caught by the store's unique-constraint backstop (`orderId`
  unique on `shipments`) and resolved the same way payment creation
  resolves it: the loser looks up the winner's row.
- **`transitionShipment`** — uses the same compare-and-set
  `transitionStatus(shipmentId, expectedStatus, nextStatus, updatedAt)`
  pattern as `Order`/`Payment`: the write only succeeds if the current
  status still matches what was read, so two admins racing the same
  shipment can never both apply conflicting transitions — the loser gets
  "This shipment changed. Refresh and try again."
- **`updateShipmentTracking`** — safe to call repeatedly; re-submitting the
  same values is a no-op write (still logs one activity per call, which is
  correct audit behavior for an admin re-confirming or correcting a value).
- **Webhook events** — deduplicated by `(carrier, providerEventId)`, a
  unique constraint in both providers, checked before and (race-safe)
  inside the processing transaction — mirrors the Phase 10 payment webhook
  foundation exactly.

## Provider abstraction

No real carrier is integrated. The abstraction that exists:

- `src/server/shipping/service.ts` — `createShipment` / `transitionShipment`
  / `updateShipmentTracking` are the complete surface a future carrier
  adapter would call into (create shipment → dispatch → tracking updates →
  delivered/failed, all through the same state machine). Nothing here is
  carrier-specific.
- `src/server/shipping/webhooks.ts` — `processShipmentWebhookEvent` is the
  carrier-agnostic event-processing seam: given a parsed, already-mapped
  `ShipmentWebhookEventInput` (carrier, event id, our order id, claimed
  status), it dedupes, locates the shipment, validates the transition, and
  applies it. A future Shiprocket/Delhivery/etc. adapter's only job is
  translating that carrier's webhook payload into this input shape and
  verifying its signature — no customer/admin domain logic changes.
- `ShipmentMethod.provider_managed` is the reserved vocabulary slot a real
  integration would use once it exists.

## Webhook foundation

`src/app/api/shipping/webhook/route.ts` mirrors the Phase 10 payment
webhook route exactly: **it always returns 501 and does not parse the
request body**, because there is no carrier secret configured to verify a
signature against — accepting arbitrary POSTed JSON here would let anyone
forge a "delivered" event. The internal processing logic
(`processShipmentWebhookEvent`) is fully built and testable independent of
the route; wiring a real carrier means adding signature verification and a
payload-to-`ShipmentWebhookEventInput` mapper, not touching this function.

## Audit / activity

Every shipment mutation writes two append-only rows in the same
transaction, mirroring the Phase 10 payment pattern:

- **`ShipmentActivity`** — the detailed record, scoped to the shipment
  (`shipmentId`, `orderId`, `type`, optional `fromStatus`/`toStatus`,
  `actorUserId` when admin-initiated, `metadata`).
- **`OrderActivity`** — a summary entry on the order's own activity stream,
  using new `shipment_*` variants added to `OrderActivityType`
  (`shipment_created`, `shipment_dispatched`, `shipment_delivered`, etc.),
  so the order's existing history view shows shipment events without a
  second timeline to read.

## Admin fulfillment actions

`src/components/admin/shipping-operations.tsx` / the corresponding server
actions in `src/lib/orders/actions.ts`:

- **Create shipment** — method selector (standard/local delivery/pickup/
  provider-managed), shown only when no shipment exists yet.
- **Update fulfillment** — one button per currently-allowed next status
  (from `allowedNextShipmentStatuses`), so an admin can never attempt an
  illegal transition from the UI (the server re-validates regardless).
  Destructive/terminal transitions (`cancelled`, `returned`,
  `delivery_failed`) require a `window.confirm` before submitting.
- **Tracking information** — carrier/tracking number/estimated delivery
  form, pre-filled with current values, save button.

All three require `shipping.write` (owner and manager roles; tailor and
staff do not get it, matching the restraint the payments permission set
established).

## Security

- **Ownership**: `getOwnShipmentForOrder(userId, order)` returns `null`
  unless `order.userId === userId` — the same ownership check every other
  customer-scoped read in this codebase uses. A customer can never see
  another customer's shipment.
- **Admin-only mutation**: `createAdminShipment`, `transitionAdminShipment`,
  `updateAdminShipmentTracking` all require `authorizeAdmin("shipping.write")`.
- **No client-controlled status**: every mutation path re-reads state
  inside a transaction and validates against the state machine; no server
  action or route accepts a raw status write.
- **No client-controlled actor identity**: the acting admin's user id comes
  from the authenticated session (`auth.session.sub`), never from a form
  field.
- **No client-controlled order ownership**: shipment creation resolves the
  order by its own id from the order lookup, never from a client-supplied
  order id at large.
- **No secrets**: no carrier API key, webhook secret, or credential is
  ever stored in `Shipment`/`ShipmentActivity`/`ShipmentWebhookEvent` —
  `metadata` fields are typed as safe scalar maps only, matching
  `PaymentActivity`'s existing shape. The webhook route has no signature
  secret configured because no carrier is connected.
- **Customer responses never expose admin data**: `ShipmentView` (customer)
  omits `ShipmentActivity` entirely and any internal note — only
  `AdminShipmentView` (admin-only reads) includes the timeline.

## JSON store / PostgreSQL parity

Both providers implement the same three repositories (`shipments`,
`shipmentActivities`, `shipmentWebhookEvents`) behind the existing
`StoreRepositories` interface — no separate shipping data path exists.

- **JSON store**: `STORE_VERSION` bumped 8 → 9; `DataStore`, `emptyStore()`,
  and `STORE_COLLECTION_KEYS` all gained the three new collections. A store
  opened at an older version upgrades through the existing `migrateStore()`
  and gets the shipping collections as empty arrays automatically — no
  existing row needs conversion. `shipments.create` enforces one-shipment-
  per-order uniqueness inside the same guarded critical section
  `payments.create` uses.
- **PostgreSQL**: new `Shipment`, `ShipmentActivity`, `ShipmentWebhookEvent`
  Prisma models plus `ShipmentStatus`/`ShipmentMethod` enums (migration
  `20260904120000_shipping_foundation_phase_11`), mapper functions in
  `src/server/data/postgres/mappers.ts`, and the corresponding repository
  implementations in `src/server/data/postgres/provider.ts`. Table/column
  naming, `onDelete: Restrict` everywhere, app-supplied TEXT ids,
  app-managed timestamps, and CHECK constraints on carrier/tracking length
  all follow the conventions documented at the top of `prisma/schema.prisma`.
  The migration SQL was verified column-for-column against
  `prisma migrate diff --from-empty` output before being committed.
- **Validation tooling**: `scripts/validate-store.mjs` now checks the three
  shipping collections — ids, timestamps, status/method vocabularies,
  orphan references to orders/shipments/users, `(carrier, providerEventId)`
  uniqueness, one-shipment-per-order uniqueness, carrier/tracking length
  bounds, and an explicit check that no shipment row carries its own
  address copy.

## Backward compatibility

An order created before this phase has no `Shipment` row. Every read path
handles that as an honest `null`, never a fabricated shipment:

- Admin order detail: "No shipment record for this order yet."
- Customer order detail: "Shipping information is not available for this
  order yet. The studio will confirm delivery details with you."
- `ShippingStatusBadge` renders "Shipping info unavailable" for a `null`
  status rather than guessing a default.
- The admin order list's Fulfillment column shows the same badges and
  handles a missing shipment/payment identically.

No historical order's total, address snapshot, or item data is touched by
this phase. `Order.shippingAmount` (the existing zero placeholder from
Phase 6C) is untouched — this phase does not implement shipping cost or
live rates; if/when dynamic shipping pricing is built, it must compute
into that existing field, not a new one, and historical order totals must
remain exactly as they were at checkout time.

## UI

- `src/components/orders/shipping-status-badge.tsx` — shared badge,
  mirroring `payment-status-badge.tsx`'s null-handling and tone-mapping.
- Admin order detail (`/admin/orders/[orderNumber]`) gained: a fulfillment-
  readiness warning banner (when blocked), a Shipping card (status,
  method, carrier, tracking, estimated delivery, timeline), stitching/
  customization indicators next to "Items to fulfil", and the
  `ShippingOperations` panel (create/transition/tracking) — visually
  distinct from the Payment card and `PaymentOperations` panel.
- Customer order detail (`/account/orders/[orderNumber]`) gained a Shipping
  card in plain language (no internal metadata, no activity timeline, no
  admin notes) — status, carrier, tracking number, estimated delivery, and
  a one-line human-friendly status summary.
- Admin order list (`/admin/orders`) gained a "Fulfillment" column: payment
  + shipping status badges and a tracking/readiness caption, computed via
  one batched `listByOrderIds` read per page rather than N+1 queries;
  existing search/filter/sort/pagination are untouched.

## Intentionally deferred

Per the phase brief, none of the following exist in this codebase:

- Shiprocket, Delhivery, Blue Dart, India Post, or any other real carrier
  integration.
- Live shipping-rate APIs or any computed/dynamic shipping cost — the
  existing `Order.shippingAmount` zero-placeholder from Phase 6C is
  untouched; a future phase would compute into that field, never invent a
  parallel one.
- Real shipping labels — nothing here generates, stores, or references an
  actual carrier label or manifest.
- Real carrier webhooks — the route always returns 501 and parses nothing.
- A production tracking API — tracking numbers are admin-typed text with
  no live lookup.
- Automated pickup scheduling.
- Vercel deployment.
- Phase 12 or anything beyond this phase's scope.

## Validation performed

- `npx tsc --noEmit` — passes with no errors.
- `npx prisma validate` — schema valid.
- `npx prisma generate` — client regenerated with the new models.
- `npx prisma migrate diff --from-empty --to-schema-datamodel` — confirmed
  the hand-written migration's tables/columns/indexes/enums match what
  Prisma itself would generate from the schema.
- `npm run validate:store` — passes against the real `.data/dev-store.json`
  (untouched) with the new shipping checks included.
- `npm run lint` — passes (two pre-existing unrelated warnings elsewhere in
  the codebase, not touched by this phase).
- `npm run build` — production build succeeds; `/api/shipping/webhook`
  builds as a dynamic route alongside every existing route.
- No automated test framework (Jest/Vitest/etc.) exists in this repository
  — reported honestly rather than fabricating a test run. No test files or
  test runner were added, matching the existing codebase's lack of one and
  Phase 10's precedent.
