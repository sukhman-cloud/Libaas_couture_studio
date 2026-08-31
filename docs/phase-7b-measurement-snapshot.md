# Phase 7B — Measurement Snapshot & Customization Foundation

Phase 7B closes the historical-integrity gap Phase 7A documented: a
measurement profile is mutable, so an order must carry an **immutable
order-time copy of the measurements it was placed with**. It also lays
the minimum clean foundation for future customization requests.

---

## 1. The snapshot

For every **stitched** order line, `createOrderFromCheckout` copies the
authoritative profile — re-read inside the order transaction, never the
checkout page's earlier data and never anything browser-submitted —
into the order item:

```text
OrderItem.stitching = {
  selected: true,
  measurementProfileId,          // reference (Phase 7A)
  measurementProfileLabel,       // label snapshot (Phase 7A)
  measurements: {                // value snapshot (Phase 7B)
    unit: "cm" | "in",           // verbatim — never reinterpreted
    fitPreference?,              // absent stays absent — no default
    notes?,                      // the profile's tailor notes, if any
    values: [{ key, value }],    // exact MeasurementValue shape
  },
}
```

Unstitched lines carry **no** stitching object and no snapshot — the
historical record simply stays "Unstitched" (§5).

### Storage decision (§3, §9)

The snapshot lives **inside the existing `order_items.stitching` JSONB
column** — the location Phase 7A explicitly reserved for it. Reasons:

- **Per-ITEM ownership**: different items in one order can carry
  different profiles; a global order-level snapshot would misattribute
  them. `Order → OrderItem → stitching.measurements` matches reality.
- It is written by the same `orders.create` inside the same transaction
  as the order — atomic by construction, both providers.
- No relational subsystem is needed: the snapshot is a closed value
  object that is never queried field-by-field, only stored and shown.
- The JSON provider stores the identical object verbatim — business
  rules stay provider-independent; `verify-migration.mjs` proves the
  round-trip field-by-field.

No Prisma migration was needed for the snapshot itself.

## 2. The one validator (§18)

`buildMeasurementSnapshot(profile)` in
[`src/server/cart/configuration.ts`](../src/server/cart/configuration.ts)
is the single authority, used inside the order transaction:

- unit must be exactly `cm` or `in`
- at least one value; every key a non-empty string; every value a
  finite positive number; **known catalog keys re-checked against the
  same `fieldBounds` the measurement form enforces** for that unit;
  unknown keys allowed by design (generic numeric checks only)
- `fitPreference` must be a known preference or absent — absence is
  preserved, "Regular" is never invented (§17)
- notes within the profile schema's 500-char cap
- the result is a fresh deep copy — never a reference into the live
  profile object

A validation failure inside the transaction throws the standard
`OrderRejection(configuration_invalid)`: **no order, no order item, the
cart untouched** (§4, proven by rollback tests on both providers).

## 3. Immutability (§7)

After commit, nothing can change the snapshot:

- the repositories expose **no order mutation method at all** — creation
  is the only write;
- profile edits touch `measurement_profiles` / `measurement_values`
  only; unit switches, renames, value edits, fit changes and archival
  were all driven through the real account actions in tests and the
  stored order stayed **byte-identical**;
- archival is soft (`archivedAt`), nothing hard-deletes profiles, and
  the order's own snapshot doesn't depend on the profile row anyway.

## 4. Old orders (§10)

Orders placed before 7B may carry stitching without `measurements`. They
load and render normally; `PlacedOrderView` reports
`hasMeasurementSnapshot: false` and the order page says, honestly:

> Measurement snapshot unavailable for this historical order.

The customer's CURRENT profile values are **never** substituted.
New stitched orders show "Measurements recorded with this order." — the
values themselves are not rendered on the customer page (presence only).

## 5. Store version 5

The JSON store gained the `customizationRequests` collection →
`STORE_VERSION` bumped 4 → 5 (the established discipline). Existing
stores upgrade in place on first boot (one `v4-upgrade-*.bak` written
first; verified on the real store); a v5 file on a pre-7B build refuses
to boot fail-closed. `export-postgres-store.mjs` therefore now writes a
v5 file — roll application code back **before** exporting if a v4 file
is ever needed.

## 6. Customization foundation (§19–22)

What exists after 7B:

- **Domain**: `CustomizationRequest { id, userId, productId?,
  measurementProfileId?, details, status, timestamps }`. The Phase-1
  sketch's `referenceImageUrls` was deliberately **removed** — uploads
  belong to the designer phase together with a real storage design.
- **Storage**: `customization_requests` table (Prisma migration
  `20260831052508`, FKs `ON DELETE RESTRICT`, `details` length CHECK
  1–1000) + the JSON collection; repositories in both providers.
- **Service** (`src/server/customization/service.ts`):
  `createCustomizationRequest` — capability re-checked on the server
  (`customizationAvailable`), optional own active measurement profile,
  details trimmed and capped, **status always `draft`** (no status can
  arrive from outside); `listOwnCustomizationRequests`.
- **Attach seam** (`validateCustomizationAttachment`): ownership,
  product capability, and product binding (a request naming product X
  can never attach to product Y) — ready for the future flow.

What deliberately does NOT exist (§24, §25, and honesty):

- **No customer-facing creation UI and no exported server action.** A
  stored request the studio cannot yet see would be a false promise —
  the entry point ships together with the designer phase and its admin
  view. The service is fully tested and ready behind the seam.
- **No cart/order attachment.** `CartItem.customizationRequestId` stays
  unset; `configurationKey` semantics are unchanged (§12). Because
  attachment is not wired, no customization snapshot exists yet — that
  limitation is explicit: when attachment arrives, the order must
  snapshot the request's state the same way measurements are
  snapshotted now.
- **No uploads**, no quoting workflow — `quoted/approved/rejected` are
  documented roadmap states only.

## 7. Roadmap (future phases)

1. Customization designer phase: creation UI + admin review view +
   reference-image uploads (re-add `referenceImageUrls` with real
   storage), cart/order attachment through the existing seam, and an
   order-time customization snapshot.
2. Order-history UI (`/account/orders`) — the first real consumer of
   the measurement snapshot for customers; an admin order view is the
   studio-facing consumer.
3. Quoting workflow activating the reserved statuses.
