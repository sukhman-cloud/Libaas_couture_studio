# Phase 7C — Customer Orders + Admin Order Management

Phase 7C is the first real consumer of the Order system: customers can
read their own order history and detail, and the studio can search,
filter, sort and open orders for fulfilment — including the Phase 7B
measurement snapshot. At the time of Phase 7C this was read and display
only; Phase 8 adds the controlled admin status workflow.

---

## 1. Routes

| Route | Audience | Guard |
| --- | --- | --- |
| `/account/orders?page=N` | customer | middleware + account layout + page (`getCustomerUser`) |
| `/account/orders/[orderNumber]` | customer | same; ownership-scoped lookup |
| `/admin/orders?page&status&sort&q` | admin | middleware + protected layout + `requireAdminSession` in the service |
| `/admin/orders/[orderNumber]` | admin | same |

URLs carry only the customer-facing order number (`LCS-XXXX-XXXX`) —
never an internal id. Every parameter is validated server-side and
falls back safely (§34). Customer pages set `robots: noindex`; admin is
unreachable without a session.

## 2. Services and view models

- **Customer** — `listOwnOrders(userId, page)` → `CustomerOrderList`
  (`CustomerOrderListItem[]`, page/totalPages/totalOrders) and
  `getOwnOrderDetail(userId, orderNumber)` → `CustomerOrderDetail`, both
  in [`src/server/orders/service.ts`](../src/server/orders/service.ts).
  The order-number format is checked **before** any lookup; unknown,
  foreign and malformed numbers all yield `null` → 404 (no enumeration
  oracle).
- **Admin** — `listAdminOrders(raw)` → `AdminOrderList` and
  `getAdminOrderByNumber(orderNumber)` → `AdminOrderDetail` in
  [`src/server/orders/admin.ts`](../src/server/orders/admin.ts). Each
  call authorizes the **admin** session itself (`requireAdminSession` +
  the `orders.read` permission) — never the customer session.
- View models carry snapshots only: no `userId`, internal ids,
  idempotency keys, fingerprints, credentials or storage keys. The item
  view (`CustomerOrderItemView`) is shared by both sides — the admin sees
  the same immutable data, nothing less.

## 3. Repository

`OrderRepository.query(OrderQuery)` was added for the admin list:
`search` (order number, customer name, customer email — normalized,
capped at 80 chars), `status`, `sort` (`newest | oldest | total_desc |
total_asc`, every sort with an id tiebreak), `limit/offset`. Both
providers run the **shared predicates** in `catalog-logic.ts`
(`orderMatches` / `sortOrders` / `queryOrders`) — the same parity
mechanism the catalog uses, so search and sorting cannot differ between
JSON and PostgreSQL and Prisma's insensitive-ILIKE pitfall never applies.
The PostgreSQL provider pushes only the exact `status` filter into SQL
and loads rows for the shared predicates — the documented catalog
trade-off, to be revisited with real volume.

Customer history reuses the existing ownership-scoped `listByUserId`
(newest first) and pages in the service (10 per page; an out-of-range
page clamps to the last one). At boutique scale a per-customer count is
tiny; the page contract is in place for when it is not (§13).

## 4. What the pages show — and what they never load

Every value comes from the **order's own snapshots**: product name and
prices, the customer snapshot, the delivery address, and for stitched
lines the profile-label snapshot plus the Phase 7B measurement snapshot
(unit, fit preference when stored, every key/value pair, tailor notes).
Unstitched lines simply say "Unstitched". Stitched orders placed before
Phase 7B state "Measurement snapshot unavailable for this historical
order." — the customer's CURRENT profile, address or product are never
consulted as substitutes.

OrderItem currently has no historical image reference, so order pages
use an honest placeholder rather than resolving media from the current
catalog. This keeps historical presentation stable when a product is
renamed, archived or its media changes.

Totals show the stored subtotal/shipping/tax/discount/total verbatim
(shipping, tax and discount are stored zeros today — nothing is
recalculated or invented).

## 5. Historical integrity (§36/§37)

Verified on both providers, through the real actions: after ordering
with a profile at **38 in / fitted / "Wedding Fit"**, the product was
renamed, re-priced, archived and discontinued; the profile re-united to
cm, its values changed to 101.6, renamed and archived; the customer
renamed; the address deleted. Customer detail and admin detail still
show **38 in, Fitted, Wedding Fit, the original product name/price and
the original address** — byte-identical stored order, identical views
across 12 simultaneous reads racing a profile edit.

## 6. Status (§28/§29 — documented decision)

Phase 7C originally rendered the then-current `pending` status through one
badge mapping (`OrderStatusBadge`) and added no mutation. Phase 8 extends
the vocabulary and supplies the controlled transition workflow.

## 7. Customization references (§26)

No attach flow exists yet, so order items never carry a customization
reference today; when one is present the pages show an honest "attached
— details arrive with the customisation workflow" note rather than
inventing a status.

## 8. Real 404s — segment loading boundaries removed

The account and admin segments carried route-level `loading.tsx`
skeletons. A route-level loading boundary starts streaming immediately
and **locks the HTTP status at 200**, turning `notFound()` into a soft
404 (the project's own documented rule since Phase 4B). With order
detail routes that must 404 for unknown/foreign/malformed numbers (§42)
— and the measurement/product edit pages that already called
`notFound()` under those boundaries — both files were removed. Account
and admin pages are server-rendered and fast; there is no UX regression
beyond the absent transition skeleton, and unknown orders now return a
genuine 404 on both surfaces.

## 9. Responsive fix

The account section's pill navigation could never scroll on phones (the
nav grid item lacked `min-w-0`), so every account page overflowed
horizontally below `lg` — a latent Phase 3 issue surfaced by the 7C
responsive suite. Fixed in `AccountNav`; all customer and admin order
pages now fit at 360–1920px.

## 10. Testing

- **Unit/integration** (real compiled services, JSON + PostgreSQL):
  repository query matrix, customer list/detail (ownership, paging,
  malformed/foreign/internal-id lookups, forbidden-key scan), admin
  service (authorization incl. customer-session rejection, search cap,
  invalid-param normalization, sorting, page clamp), §36/§37 mutation
  matrix, §49 concurrent reads.
- **E2E over HTTP** (both providers): the §48 list — customer list/empty
  state/newest-first/pagination, detail content, escaped notes, real
  404s and the enumeration check, anonymous/customer/admin boundaries,
  admin search by number/name/email, status/sort/page handling, admin
  detail snapshots, no auth material, and the post-mutation checks.
- **Browser** (Playwright + axe): 10 widths for customer and admin
  list+detail, keyboard reach, labelled search/filters, table semantics,
  definition-list measurements, mobile admin drawer.
