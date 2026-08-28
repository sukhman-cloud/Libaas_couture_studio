# Phase 7A — Measurements, Stitching Configuration & Cart Integration

Phase 7A connects the Phase 3 measurement system to the Phase 5A cart and
the Phase 6C order pipeline: a product that offers stitching can now be
added **Unstitched** or **Stitched with a measurement profile**, the two
exist as separate cart lines, the configuration is validated in one
place, survives into the order, and blocks checkout when it goes stale.

No stitching price exists in the product model, so **none is invented**:
a configuration never changes a line's price. When the business defines a
stitching fee, the validated configuration built in
[`src/server/cart/configuration.ts`](../src/server/cart/configuration.ts)
is the natural carrier for its price contribution.

---

## 1. The single validator

`src/server/cart/configuration.ts` is the ONE home of every rule (§20):

- `parseConfigurationInput` — defensive parse of the browser's proposal
  (`{ stitching: "unstitched" | "stitched", measurementProfileId? }`).
  `undefined` means the pre-7A default (unstitched), malformed input is
  rejected, and a profile id sent with "unstitched" is discarded.
- `validateCartConfiguration` — for a PROPOSED configuration: product
  published + purchasable, stitching only when `stitchingAvailable`,
  stitched requires a profile that **exists, belongs to the
  authenticated user, and is not archived** (missing/foreign/archived
  fail identically — no oracle). Returns the storage-ready configuration
  with the derived key.
- `checkCartLineConfiguration` — for an EXISTING line: re-validates the
  stored configuration (profile still owned + active, product still
  stitchable) and names the issue when it no longer holds.
- Both accept injectable repositories, so the **order transaction runs
  the same validation against transaction-scoped rows** — and both are
  lock-free (callers hold the customer lock).

Callers: `addToCart`, `updateCartItemConfiguration`, the cart view,
checkout readiness, and `createOrderFromCheckout`. No rule is duplicated
anywhere else.

## 2. `configurationKey`

Deterministic, always server-derived (`deriveConfigurationKey`), never
read from a client:

    unstitched            →  ""             (pre-7A compatible)
    stitched + profile P  →  "stitched:P"

The empty key for unstitched means every pre-7A cart line **is** a valid
unstitched line, and newly added unstitched pieces merge with legacy
lines naturally. The key never leaves the server (verified by E2E HTML
scans). In PostgreSQL the identity is enforced by the existing unique
constraint `(cart_id, product_id, configuration_key)`.

## 3. Cart identity & merging

- Same product + same configuration → quantity merges into the one line.
  At the per-item maximum the customer is **told** ("already holds the
  maximum" / "capped at the maximum") — never a silent discard with a
  success toast.
- Same product + different configuration → separate lines (stitched for
  two different profiles are two lines).
- `updateCartItemConfiguration(itemId, configuration)` changes a line's
  configuration in place (identity, `createdAt` and price snapshot
  kept). If the result matches another line, the two **merge** — the
  target keeps its identity and snapshot, quantities add, and the merge
  is REFUSED (nothing lost) when it would exceed the maximum **or when
  the two lines carry different price snapshots** (the Phase 6A
  price-acknowledgement consent must survive merging; quantity may never
  silently change price). The rewrite is one atomic cart write under the
  customer lock.

## 4. Ownership & security

Identity always comes from `getCustomerUser()`. The browser contributes
only a product slug / own line id and the configuration proposal; the
server re-derives everything else. Verified by tests: foreign profile,
archived profile, unknown profile, foreign cart line, forged
`configurationKey` / `unitPrice` / `userId` fields, stitched on a
non-stitchable product, and every non-purchasable product state are all
rejected; customer B's cart and ids never leak into A's HTML.

## 5. Stale configurations (§23)

A configured line whose profile is later archived — or whose product
stops offering stitching — is **never deleted and never silently
ordered**: the cart flags it with the exact reason, checkout readiness
becomes `configuration_invalid` (confirm disabled, issue named), and
`createOrderFromCheckout` re-validates inside its transaction and
rejects with `configuration_invalid` even if a stale tab submits. The
fix paths are the line's own configuration select (switch profile /
unstitched) or removal.

## 6. Order integration & the measurement snapshot

Order items carry `configurationKey` and a **fresh** stitching object
built at commit time: `{ selected, measurementProfileId,
measurementProfileLabel }`. The label is snapshotted so the historical
order stays readable after a rename or archive (verified immutable).
Profiles are soft-deleted only, so the reference always resolves.

**Deliberately NOT done in 7A (per spec): snapshotting the measurement
VALUES.** The profile reference + label are recorded, and nothing reads
values from an order yet (no order-history or admin order UI exists).
**Phase 7B MUST, at order-creation time, copy the profile's values
(key/value/unit, and fitPreference/notes) into the order item's
stitching record** — a profile is mutable, and the values the studio
stitches against must be the values the customer ordered with. The
`order_items.stitching` JSONB column already accommodates this without a
schema migration; the snapshot should be built in the same place the
label snapshot is built today
([`src/server/orders/service.ts`](../src/server/orders/service.ts), the
per-line loop).

## 7. UI

- **Product page** — when `stitchingAvailable` (and only then): an
  accessible fieldset with Unstitched/Stitched radios; for Stitched, the
  customer's own active profiles in a labelled select (default profile
  preselected), plus "Create measurement profile" which routes through
  the EXISTING Phase 3 form with a validated `?from=` return path — the
  new profile is selectable immediately on return. Signed-out customers
  are guided to sign in. Products without the flag render nothing new.
- **Cart** — each relevant line shows `Stitched` + "Measurement:
  <label>" or `Unstitched`, a per-line labelled select to change the
  configuration, and warning alerts (with the checkout's wording) for
  stale configurations. Internal keys and ids are never rendered.
- **Checkout** — lines show the configuration and profile name; stale
  configurations appear in the attention banner and disable the confirm
  button with a specific reason.
- **Order success** — stitched lines show "(Stitched — <label>)".

## 8. Concurrency (§22)

All configuration mutations run under the existing per-customer lock;
the order transaction re-reads inside `repos.transaction`. Tested (both
providers): simultaneous same-config adds → one line; different configs
→ distinct lines; racing configuration updates → no duplicate keys, no
lost quantity; crossing merges → serialized into one line with the full
quantity; archive racing an add → either rejected or flagged, never
silent. Cross-process backstops: the cart-items unique constraint, and
`ensureCart` now recovers from a first-cart unique-violation race
instead of crashing.

## 9. No schema change

`cart_items` (configuration_key, stitching JSONB) and
`measurement_profiles` already held everything Phase 7A needs — **no
Prisma migration in this phase**; `prisma migrate diff` shows no drift.
The JSON↔PostgreSQL migration pipeline (validate / migrate / verify) was
re-proven with a store containing stitched cart lines and orders with
label snapshots: field-by-field VERIFIED.

## 10. Adversarial review

A six-lens adversarial review (ownership/IDOR, forgery, merge logic,
races, stale flows, regressions) with three-skeptic verification per
finding confirmed four defects, all fixed and re-tested: the HIGH
silent-re-price-through-merge (now refused), the `ensureCart`
cross-process race, the misleading at-cap success toast, and a crash on
a duplicated `?from` query param.
