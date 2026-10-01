# Libaas Couture Studio — Project Overview

A real, production boutique application for **Libaas Couture Studio**, a
bespoke couture/stitching business based in Mohali, Punjab. It is a single
Next.js app with two halves: a **customer storefront** and an **admin
management system**, sharing one data layer and one domain model.

This is not a demo — it serves a real business, with a real production
database (Postgres/Neon) and real admin staff accounts. Treat customer data,
order history and financial records as real and historically immutable.

## What the business does

Libaas Couture Studio sells designer suits, handwork and custom stitching.
Customers can buy a product as-is, or request it **stitched** to one of
their own saved measurement profiles. Beyond catalog purchases, the studio
also takes fully custom design requests (no existing product) and other
made-to-order work through the customization workflow.

## Who uses this app

- **Customers** — browse the catalog, save measurement profiles and
  addresses, buy products (optionally stitched-to-measurement), track
  orders, submit customization/custom-design requests, build a wishlist.
- **Studio staff**, via four fixed roles (`src/lib/auth/roles.ts`):
  - **Owner** — full access to everything, including staff management and
    settings.
  - **Manager** — day-to-day operations: orders, products, inventory,
    customers, payments (read), shipping, analytics. Cannot manage staff
    accounts.
  - **Tailor** — read-only access to orders, appointments, inventory. The
    production-floor view.
  - **Staff** — orders (read), customers (read), appointments (read/write).
    The front-desk/general-support view.

  There is **no public admin signup**. The first owner account is created
  once via `scripts/bootstrap-admin.mjs`; every admin account after that is
  created by an existing owner/manager from `/admin/staff`.

## Core customer-facing features (all implemented)

- **Catalog browsing** — shop grid, categories, collections, search, facet
  filters, product detail pages with image galleries.
- **Stitching at purchase** — a product that supports stitching can be
  added to the cart **unstitched** or **stitched to a chosen measurement
  profile**. The configuration is validated server-side (profile ownership,
  archival state, product capability) and is blocked at checkout if it goes
  stale before the order is placed.
- **Measurement snapshot (immutability guarantee)** — the moment an order
  is placed, the exact measurement values, unit, fit preference and tailor
  notes used for that order are copied into the order itself. Editing,
  renaming or archiving the measurement profile afterwards can **never**
  change what a past order represents. Orders placed before this snapshot
  existed honestly report "measurement snapshot unavailable" rather than
  substituting current data.
- **Cart & wishlist** — persistent per-customer, with safe quantity merging
  for identical configurations.
- **Checkout & orders** — address selection, order confirmation, order
  history, per-order status/payment/shipping tracking.
- **Customer accounts** — signup/login, password reset (email-based token,
  currently delivered via server console log in this environment — see
  CLAUDE.md), profile editing, saved addresses, saved measurement profiles,
  account deactivation.
- **Customization requests** — a customer can request custom work tied to
  an existing product, a specific order/order item, or a fully custom design
  with no existing product at all. Tracked through a status workflow
  (pending → reviewing → … → completed/rejected/cancelled); the studio
  responds via the admin customizations workflow below.
- **Instagram feed** (optional) — the home page can show the studio's
  latest Instagram posts via the official Meta Graph API. Disabled cleanly
  (no breakage) if no access token is configured.

## Core admin features

### Fully implemented, real operational tools

- **Dashboard** (`/admin`) — an operational command center: order pipeline
  by status, fulfillment/payment problems needing attention, low-stock
  alerts, pending customizations, recent orders, studio overview.
- **Orders** (`/admin/orders`, `/admin/orders/[orderNumber]`) — search,
  filter, sort, paginate; full order detail with controlled status
  transitions, internal notes, payment recording, shipment creation and
  tracking updates.
- **Products / Categories / Collections** — full catalog CRUD, media
  management, archive/restore (soft delete, never hard delete).
- **Inventory** (`/admin/inventory`) — stock levels, low-stock alerts, manual
  stock adjustments (restock/damage/correction/return, each recorded as an
  immutable movement), per-product tracking toggle and threshold.
- **Customizations** (`/admin/customizations`) — the full request list and
  per-request detail: customer/order context, controlled status
  transitions, internal notes.
- **Custom Orders** (`/admin/custom-orders`) — the same customization-request
  data, filtered to fully-custom design requests that have no existing
  product. (Not a separate data model — a differently-scoped view over
  `CustomizationRequest`.)
- **Stitching** (`/admin/stitching`) — a derived workload view: every
  stitched order item on an active (non-terminal) order, with its
  measurement snapshot, so the studio can see what still needs to be
  stitched. There is currently no independent stitching stage/assignment
  concept in the data model (no "who is stitching this," no priority
  field) — this view is honestly built from existing order data only.
- **Customers** (`/admin/customers`) — searchable/sortable customer list and
  a full detail page: contact info, saved addresses, measurement profiles,
  complete order history, customization request history.
- **Staff** (`/admin/staff`) — list every admin account and its role;
  create new staff accounts (any of the 4 roles); deactivate/reactivate an
  account (also invalidates its sessions immediately); change a staff
  member's role. Owner accounts are protected — they cannot deactivate or
  demote themselves, and only another owner can deactivate or change an
  owner's role.
- **Payments** (`/admin/payments`) — studio-wide searchable/filterable
  payment list across all orders; per-order payment detail already lived on
  the order page (status, provider, attempts, activity history, manual
  "mark as paid," and controlled fail/cancel/refund transitions).
- **Audit Logs** (`/admin/audit-logs`) — a merged, paginated activity feed
  across order, payment, shipment, customization and inventory-movement
  history — who did what and when.
- **Analytics** (`/admin/analytics`) — revenue trend (last 30 days), average
  order value, order-status breakdown and top products, computed only from
  real order/payment data. Shows an honest "not enough data yet" state
  rather than a misleading chart when there are too few orders in the
  window.
- **Content** (`/admin/content`) — Instagram connection status and manual
  refresh.

### Not yet built (placeholders only — do not assume these work)

These render a static "coming later" placeholder with no backend behind
them. Building any of them for real requires new Prisma schema (a type
sketch already exists in `src/types/domain.ts` for several of these, but
nothing is wired to a database table):

- **Appointments** — consultations, measurement and fitting scheduling.
- **Alterations** — alteration intake, due dates, ready-for-pickup tracking.
- **Quotes** — custom-work quotes with pricing, validity window, customer
  approval. (A `Quote` type sketch exists in `domain.ts` with its own
  status lifecycle, separate from `CustomizationRequest`.)
- **Reviews** — customer product/order review moderation.
- **Offers** — discount codes/promotions. (`Order.discountAmount` exists as
  a field but is always zero today — no discount-application logic exists
  anywhere yet.)
- **Settings** — business details (address, hours, contact). Currently
  these facts live as hardcoded placeholders in `src/config/site.ts`, not
  in a database table, so there is nothing yet for a Settings page to edit
  without first adding that storage.

## Business rules that must never be silently changed

- **No public admin signup**, ever, under any code path.
- **Role is always re-derived server-side**, never trusted from a client or
  from the session token itself.
- **An order/payment/shipment's historical data is immutable.** Never
  recompute a past order's price, measurements, or customer snapshot from
  current/live data.
- **Money is always integer paise**, never a float, and the
  subtotal/shipping/tax/discount/total formula always holds exactly.
- **Soft delete only.** Categories, collections, and products are archived,
  never hard-deleted — and every "delete" admin action must offer restore.
- **Owner-only actions stay owner-only**, enforced server-side
  (`authorizeAdmin`), regardless of what the UI happens to show a given
  role.
