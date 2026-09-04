# Phase 10 — Payment Foundation

A payment domain and state architecture for Libaas Couture Studio, built to
slot into the existing order/checkout system without rewriting it. **No
real payment gateway is connected.** Every order today is fulfilled as
studio-confirmed cash on delivery; this phase gives that flow (and any
future online-gateway flow) a real, auditable payment record instead of an
implicit assumption.

## Architecture

A `Payment` is a separate entity from `Order`, related 1:1 by `orderId`
(one payment per order, enforced by a unique constraint in both the JSON
store and Postgres). `Order.status` never encodes payment information —
the two lifecycles are independent:

- **Order status** (`pending → confirmed → processing → ready → completed`,
  or `cancelled`) — the studio's fulfilment workflow, unchanged from Phase 8.
- **Payment status** (below) — whether/how the order has been paid for.

```
Order ──1:1── Payment ──1:N── PaymentAttempt   (append-only, never overwritten)
                    └──1:N── PaymentActivity   (append-only audit log)

PaymentWebhookEvent   (standalone; dedup key: provider + providerEventId)
```

## Payment statuses

```
unpaid ──▶ pending ──▶ authorized ──▶ paid ──▶ refunded
   │           │             │
   └────▶ cancelled ◀────────┘
   │
   └────▶ paid   (manual/COD skips straight from unpaid to paid)

pending/authorized ──▶ failed ──▶ pending | cancelled
```

Defined and enforced in `src/server/payments/workflow.ts`
(`isAllowedPaymentTransition`), mirroring the existing
`src/server/orders/workflow.ts` pattern exactly. Every mutation path —
`initiatePayment`, `recordManualPayment`, `transitionPaymentStatus`, and the
webhook processor — validates the transition server-side before writing.
**No client input can set a payment status directly**; every write goes
through one of those four functions, each of which re-reads the current
row inside a transaction before validating and applying the transition.

## Payment methods (`PaymentProvider`)

`manual | cash_on_delivery | online_gateway` — an existing enum in the
domain model (`src/types/domain.ts`) that predates this phase's
implementation. Only `cash_on_delivery` is actually reachable today: it is
the provider `initiatePayment` uses automatically right after order
creation (checkout offers no payment-method choice, matching the existing
"studio confirms payment and delivery with you" flow). `manual` is what the
admin's "record payment" action creates when no payment exists yet.
`online_gateway` is wired in the type system, the state machine, and the
service layer, but nothing in the UI offers it — initiating one would
create a payment record and a `pending` attempt and then simply stop,
because there is no gateway to redirect to. This is intentional: the
foundation must never claim an online payment succeeded.

## Payment attempts

`PaymentAttempt` rows are the append-oriented history of attempts to pay
one `Payment`. They are never overwritten or deleted, even on failure —
this is where a future gateway integration would record each
authorize/capture/fail cycle. Uniqueness is `(paymentId, idempotencyKey)`,
so a retried attempt with the same key is a safe no-op rather than a
duplicate row.

## Idempotency

Every payment-mutating operation is idempotent, using the same discipline
as `createOrderFromCheckout` (Phase 6C):

- **`initiatePayment`** — re-reads the order inside a transaction; if a
  payment already exists for that order, it returns the existing record
  (`outcome: "replayed"`) rather than erroring. A cross-process race on the
  same order is caught by the store's unique-constraint backstop
  (`orderId` unique on `payments`) and resolved the same way order creation
  resolves an idempotency-key race: the loser looks up the winner's row.
- **`recordManualPayment`** — re-checks the payment's current status inside
  the transaction; calling it again on an already-`paid` payment is a safe
  no-op, not an error.
- **Webhook events** — deduplicated by `(provider, providerEventId)`, a
  unique constraint in both providers. `processPaymentWebhookEvent` checks
  for a prior delivery before opening a transaction, re-checks inside the
  transaction (the race-safe pattern), and returns `outcome: "duplicate"`
  on a repeat delivery without touching payment state again.
- **Checkout integration** — the checkout form's existing per-render
  idempotency key already makes `createOrderFromCheckout` idempotent; the
  payment-initiation call that follows it is itself idempotent
  independently, so a retried/duplicated checkout submission can never
  produce two payment records for the same order.

## Webhook foundation

`src/server/payments/webhooks.ts` (`processPaymentWebhookEvent`) is the
internal, provider-agnostic processing seam a future gateway integration
plugs into. It is fully testable today with no external dependency: given
a parsed `WebhookEventInput` (provider, event id, our order id, the claimed
status), it records the event, locates the payment by order id, validates
the transition against the state machine, applies it, and logs activity —
idempotently.

`src/app/api/payments/webhook/route.ts` is the (currently inert) HTTP
endpoint. **It always returns 501** and does not parse the request body,
because there is no provider secret configured to verify a signature
against — accepting arbitrary POSTed JSON here would let anyone forge a
"payment succeeded" event. Wiring a real provider means: verify that
provider's signature, map its event payload to a `WebhookEventInput`
(pulling the order id from whatever field that provider echoes back), and
call `processPaymentWebhookEvent`. No fake gateway responses exist anywhere
in this codebase.

## Audit / activity

Every payment transition writes two append-only rows in the same
transaction:

- **`PaymentActivity`** — the detailed record, scoped to the payment
  (`paymentId`, `orderId`, `type`, optional `fromStatus`/`toStatus`,
  `actorUserId` when admin-initiated, `metadata`).
- **`OrderActivity`** — a summary entry on the order's own activity stream
  (reusing the `payment_created` / `payment_succeeded` / ... variants that
  already existed in `OrderActivityType` before this phase), so the
  order's own history — which the admin UI already renders — includes
  payment events without needing a second UI to read.

## Manual/offline payment recording

`recordManualPayment` (service) / `recordAdminManualPayment` (admin
wrapper) is the admin-only path for confirming a cash or offline payment.
Requirements enforced:

- **`payments.write` permission required** — checked via the existing
  `authorizeAdmin` / `hasPermission` pattern (`payments.read`/`write` were
  already defined in the `Permission` union and role map; this phase is
  their first consumer).
- **Amount is never an input** — the payment (created if absent) always
  carries `order.total`; there is no field anywhere for an admin to type a
  different figure, so a payment can never diverge from what was ordered.
- **State-machine validated** — an already-paid payment returns success as
  a no-op; an order in a status the machine disallows (e.g. `refunded`)
  is rejected with a clear error.
- **Customers cannot call this** — it is a separate server action from
  every customer-facing order action, gated by the admin session.

## Security

- **Ownership**: `getOwnPaymentForOrder(userId, order)` returns `null`
  unless `order.userId === userId` — the same ownership check every other
  customer-scoped read in this codebase uses. A customer can never see
  another customer's payment.
- **Admin-only mutation**: every payment-status-changing function outside
  `initiatePayment` (which only ever creates `unpaid`/`pending`, never
  `paid`) requires `authorizeAdmin("payments.write")`.
- **No client-controlled status or amount**: every payment mutation path
  re-reads state inside a transaction and derives the amount from
  `order.total`; no server action or route accepts a status or amount
  parameter from a form or request body.
- **No client-controlled order ownership**: payment initiation resolves the
  order by its own id from the just-created order record, never from a
  client-supplied order id at large.
- **No sensitive credentials**: no raw card number, CVV, bank credential,
  or provider secret is ever stored, logged, or returned to a customer API.
  `Payment.metadata` and `PaymentActivity.metadata` are typed as safe
  scalar maps (`string | number | boolean | null` values only), matching
  `OrderActivity.metadata`'s existing shape.
- **No secrets in the JSON store**: nothing added in this phase stores a
  provider secret; the webhook route has no signature-verification secret
  configured because no provider is connected.

## JSON store / PostgreSQL parity

Both providers implement the same four repositories
(`payments`, `paymentAttempts`, `paymentActivities`, `paymentWebhookEvents`)
behind the existing `StoreRepositories` interface — no separate payment
data path exists.

- **JSON store**: the `Payment`/`PaymentAttempt`/`PaymentActivity`/
  `PaymentWebhookEvent` types, repository interfaces, and JSON-store
  repository implementations already existed in the codebase before this
  phase (domain types, `repositories.ts`, `store-provider.ts` — all
  pre-built scaffolding). `STORE_VERSION` was already at 8 with the
  payment collections included in `emptyStore()`/`STORE_COLLECTION_KEYS`,
  so no new store-version bump was needed; a store opened at an older
  version upgrades through the existing `migrateStore()` and gets the
  payment collections as empty arrays automatically.
- **PostgreSQL**: this phase adds the missing half — `Payment`,
  `PaymentAttempt`, `PaymentActivity`, `PaymentWebhookEvent` Prisma models
  (migration `20260904060000_payment_foundation_phase_10`), mapper
  functions in `src/server/data/postgres/mappers.ts`, and the
  corresponding repository implementations in
  `src/server/data/postgres/provider.ts`. Table/column naming, `onDelete:
  Restrict` everywhere, app-supplied TEXT ids, BigInt-paise money, and
  app-managed timestamps all follow the conventions documented at the top
  of `prisma/schema.prisma`.
- **Validation tooling**: `scripts/validate-store.mjs` now checks the four
  payment collections — ids, timestamps, status/provider vocabularies,
  orphan references to orders/payments/users, `(paymentId, idempotencyKey)`
  and `(provider, providerEventId)` uniqueness, and that a payment's
  amount matches its order's total.

## Backward compatibility

An order created before this phase has no `Payment` row. Every read path
handles that as an honest `null`, never a fabricated payment:

- Admin order detail: "No payment record for this order yet."
- Customer order detail: "Payment information is not available for this
  order. The studio will confirm payment and delivery with you."
- `PaymentStatusBadge` renders "Payment info unavailable" for a `null`
  status rather than guessing a default.

No historical order's totals are touched by this phase — payment amounts
are read from `order.total` at the moment a payment is created, never
written back onto the order.

## UI

- `src/components/orders/payment-status-badge.tsx` — shared badge,
  mirroring `order-status-badge.tsx`'s tone-mapping pattern.
- Admin order detail (`/admin/orders/[orderNumber]`) gained a Payment card
  (status, method, amount, provider reference when present, attempt
  history) and a "Record payment" action, both built from the existing
  `Card`/`CardContent`/`Heading`/`Caption` components and `formatPrice`.
- Customer order detail (`/account/orders/[orderNumber]`) gained a Payment
  card in customer-friendly language (no internal metadata, no webhook
  payloads, no provider reference) replacing the old static "no payment
  taken online" sentence with the order's actual payment state.

## Intentionally deferred

Per the phase brief, none of the following exist in this codebase:

- Razorpay, Stripe, PayU, Paytm, or any other real gateway integration.
- Real bank/payment credentials or provider secrets anywhere (source,
  JSON store, or environment defaults).
- A real webhook endpoint connected to a live provider — the route always
  returns 501 and parses nothing.
- Real refunds — the `refunded` status and its transition exist in the
  state machine and schema so a completed payment's history is preserved
  when a future phase adds refund processing, but no function initiates
  or completes one.
- Payment settlement/accounting beyond the single `Payment.amount` field.
- Shipping integration.
- Vercel deployment.
- Phase 11 or anything beyond this phase's scope.

## Validation performed

- `npx tsc --noEmit` — passes with no errors.
- `npx prisma validate` — schema valid.
- `npx prisma generate` — client regenerated with the new models.
- `npx prisma migrate diff --from-empty --to-schema-datamodel` — confirmed
  the hand-written migration's tables/columns/indexes match what Prisma
  itself would generate from the schema.
- `npm run validate:store` — passes against the real `.data/dev-store.json`
  (untouched; still version 7, upgrades in-memory on next read) with the
  new payment checks included.
- `npm run lint` — passes (two pre-existing unrelated warnings elsewhere in
  the codebase, not touched by this phase).
- `npm run build` — production build succeeds; `/api/payments/webhook`
  builds as a dynamic route alongside every existing route.
- No automated test framework (Jest/Vitest/etc.) exists in this repository
  — reported honestly rather than fabricating a test run. No test files or
  test runner were added, matching the existing codebase's lack of one.
