# File Map

Where each feature's code lives. See `CLAUDE.md` for conventions and
`ai/PROJECT.md` for what each feature does. Paths are relative to the repo
root.

## Routes — `src/app/`

### Public / customer-facing

| Area | Path |
| --- | --- |
| Home | `src/app/(customer)/page.tsx` |
| Shop / catalog browse | `src/app/(customer)/shop/` |
| Categories | `src/app/(customer)/categories/` |
| Collections | `src/app/(customer)/collections/` |
| Product detail | `src/app/(customer)/products/[slug]/` |
| Search | `src/app/(customer)/search/` |
| Cart | `src/app/(customer)/cart/` |
| Wishlist (redirect) | `src/app/(customer)/wishlist/page.tsx` → `/account/wishlist` |
| Checkout | `src/app/(customer)/checkout/` |
| Login / signup / password reset | `src/app/(customer)/login/`, `signup/`, `forgot-password/`, `reset-password/` |
| Customer shell layout | `src/app/(customer)/layout.tsx` |

### Customer account (session-guarded)

| Area | Path |
| --- | --- |
| Account hub | `src/app/(customer)/account/page.tsx` |
| Profile | `src/app/(customer)/account/profile/` |
| Settings (password, deactivate) | `src/app/(customer)/account/settings/` |
| Addresses | `src/app/(customer)/account/addresses/` |
| Orders + detail | `src/app/(customer)/account/orders/` |
| Wishlist | `src/app/(customer)/account/wishlist/` |
| Measurement profiles | `src/app/(customer)/account/measurements/` |
| Customization requests | `src/app/(customer)/account/customizations/` |
| Guarded account layout | `src/app/(customer)/account/layout.tsx` |

### Admin

| Area | Path | Status |
| --- | --- | --- |
| Login | `src/app/admin/login/` | real |
| Protected shell layout | `src/app/admin/(protected)/layout.tsx` | real |
| Dashboard | `src/app/admin/(protected)/page.tsx` | real |
| Orders + detail | `src/app/admin/(protected)/orders/` | real |
| Products / new / edit | `src/app/admin/(protected)/products/` | real |
| Categories | `src/app/admin/(protected)/categories/` | real |
| Collections | `src/app/admin/(protected)/collections/` | real |
| Inventory + detail | `src/app/admin/(protected)/inventory/` | real |
| Customizations + detail | `src/app/admin/(protected)/customizations/` | real |
| Custom Orders | `src/app/admin/(protected)/custom-orders/` | real (filtered view of customizations) |
| Stitching | `src/app/admin/(protected)/stitching/` | real (derived workload view) |
| Customers + detail | `src/app/admin/(protected)/customers/` | real |
| Staff | `src/app/admin/(protected)/staff/` | real |
| Payments | `src/app/admin/(protected)/payments/` | real |
| Audit Logs | `src/app/admin/(protected)/audit-logs/` | real |
| Analytics | `src/app/admin/(protected)/analytics/` | real |
| Content | `src/app/admin/(protected)/content/` | real (Instagram status only) |
| Appointments | `src/app/admin/(protected)/appointments/` | **placeholder** |
| Alterations | `src/app/admin/(protected)/alterations/` | **placeholder** |
| Quotes | `src/app/admin/(protected)/quotes/` | **placeholder** |
| Reviews | `src/app/admin/(protected)/reviews/` | **placeholder** |
| Offers | `src/app/admin/(protected)/offers/` | **placeholder** |
| Settings | `src/app/admin/(protected)/settings/` | **placeholder** |

Admin nav config (icons, grouping, hrefs): `src/config/nav.ts`
(`adminNavGroups`). Customer nav: same file (`customerPrimaryNav`,
`customerActionNav`, `customerBottomNav`).

### API routes — `src/app/api/`

| Route | Purpose |
| --- | --- |
| `api/health/` | liveness probe |
| `api/media/[id]/` | serves uploaded catalog media (public) |
| `api/payments/webhook/` | payment webhook intake — returns 501, no gateway connected yet |
| `api/shipping/webhook/` | shipping webhook intake — returns 501, no carrier connected yet |

### Cross-cutting

- `src/middleware.ts` — fast cookie-presence redirect for `/admin`,
  `/account`, `/checkout` (UX only; real auth check is server-side in layouts)
- `src/app/layout.tsx` — root layout (fonts, toast provider)
- `src/app/robots.ts`, `src/app/sitemap.ts` — SEO
- `src/app/error.tsx`, `src/app/not-found.tsx` — global error/404

## Business logic — `src/server/`

One directory per domain. Within each: `service.ts` = core logic,
`admin.ts` = admin-only reads/mutations, `workflow.ts` = status state
machine, where applicable.

| Domain | Path | Covers |
| --- | --- | --- |
| Orders | `src/server/orders/` | order creation from checkout, own-order reads, admin order list/detail/status/notes, admin payment & shipment actions tied to an order |
| Payments | `src/server/payments/` | payment creation, manual payment recording, status transitions, admin payment list, webhook processing (unwired) |
| Shipping | `src/server/shipping/` | shipment creation/transitions/tracking, fulfillment readiness, webhook processing (unwired) |
| Inventory | `src/server/inventory/` | stock levels, manual adjustments, tracking settings |
| Customization | `src/server/customization/` | customer-facing + admin customization-request workflow |
| Customers | `src/server/customers/` | admin customer list/detail |
| Staff | `src/server/staff/` | admin account listing |
| Stitching | `src/server/stitching/` | derived stitching workload |
| Analytics | `src/server/analytics/` | admin analytics summary |
| Audit | `src/server/audit/` | merged admin audit log feed |
| Catalog | `src/server/catalog/` | public product/category/collection reads |
| Cart | `src/server/cart/` | cart/wishlist configuration assembly |
| Commerce | `src/server/commerce/` | shared cart purchasability rules (no import cycle with configuration) |
| Checkout | `src/server/checkout/` | checkout view assembly/validation |
| Account | `src/server/account/` | `security.ts` — the required seam for security-sensitive account mutations (`mutateAccount`, `mutateAdminAccount`, `rotateSession`) |
| Instagram | `src/server/instagram/` | Meta Graph API feed service |
| Email | `src/server/email/` | email provider abstraction (console-only today) |
| Storage | `src/server/storage/` | media storage abstraction + upload validation |
| (top-level) | `src/server/lock.ts` | keyed in-process mutex, lock-order convention |
| (top-level) | `src/server/paths.ts` | local filesystem path resolution (JSON store, media dir) |

### Data layer — `src/server/data/`

| File | Role |
| --- | --- |
| `repositories.ts` | repository interface contracts — the seam everything else depends on |
| `store-provider.ts` | shared engine behind the memory + file providers |
| `memory.ts` | in-memory provider (tests/throwaway) |
| `file.ts` | JSON-file provider (local dev default) |
| `catalog-logic.ts` | shared, provider-agnostic query predicates (filter/sort/facet/page) |
| `index.ts` | `getRepositories()` — the one entry point, switches on `DATA_PROVIDER` |
| `postgres/client.ts` | lazy Prisma client singleton |
| `postgres/mappers.ts` | Prisma row ↔ domain-type mapping |
| `postgres/provider.ts` | the Postgres `Repositories` implementation |

## `src/lib/` — server actions & utilities

| Path | Role |
| --- | --- |
| `auth/actions.ts` | admin login, logout, staff create/deactivate/reactivate/role-change (`"use server"`) |
| `auth/customer-actions.ts` | customer signup/login/password reset/deactivate (`"use server"`) |
| `auth/admin-guard.ts` | `authorizeAdmin()`, `requireAdminSession()` |
| `auth/session.ts` / `customer-session.ts` | session read/verify |
| `auth/signed-token.ts` | HMAC-signed token primitive (shared by both session types) |
| `auth/password.ts` | scrypt hashing/verification |
| `auth/roles.ts` | `rolePermissions` — the role → permission map |
| `auth/constants.ts` | session cookie names, max-age, etc. |
| `account/actions.ts` | account mutation actions (wraps `server/account/security.ts`) |
| `catalog/actions.ts` | admin catalog mutations (`"use server"`) |
| `catalog/shop-params.ts` | shop query-param parsing |
| `checkout/actions.ts` | checkout submission (`"use server"`) |
| `commerce/actions.ts` | cart/wishlist mutations (`"use server"`) |
| `customization/actions.ts` | customer-facing customization actions (`"use server"`) |
| `customization/admin-actions.ts` | admin customization actions (`"use server"`) |
| `inventory/actions.ts` | admin inventory actions (`"use server"`) |
| `orders/actions.ts` | admin order/payment/shipment actions (`"use server"`) |
| `social/actions.ts` | Instagram refresh action (`"use server"`) |
| `validation/catalog.ts`, `validation/customer.ts` | Zod schemas |
| `env.ts` | validated env config (`DATA_PROVIDER`, `SESSION_SECRET`, etc.) |
| `utils.ts` | generic helpers (`cn()`, `formatPrice()`, etc.) |

## Domain model & schema

- `src/types/domain.ts` — single source of truth for every entity/enum
  (User/Auth, Roles, Catalog, Inventory, Measurements/Customization,
  Cart/Wishlist, Orders, Payments, Shipping, Appointments/Alterations,
  Reviews/Notifications/AuditLog — note several of the last group are
  type-only, not yet backed by a repository or Prisma model).
- `prisma/schema.prisma` — Postgres schema, a direct relational translation
  of `domain.ts`. Migrations: `prisma/migrations/`.

## UI components — `src/components/`

| Directory | Contains |
| --- | --- |
| `ui/` | design-system primitives — button, badge, table (`RowCard`/`Table`), modal, confirmation-dialog, pagination, form-field, toast, dropdown, tabs, input, select, checkbox, radio, switch, card, alert, empty-state, error-state, loading-state, skeleton, spinner, tooltip, typography, breadcrumb, page-header, avatar, drawer, icon-button, password-input, search-input, layout |
| `layout/` | site-header, site-footer, bottom-nav, admin-sidebar, admin-topbar |
| `catalog/` | customer catalog browsing — catalog-browser, product-card/grid/gallery, filter-chips, mobile-filter-drawer, share-button |
| `commerce/` | cart/wishlist line controls — cart-line-configuration/controls, clear-button, product-actions, wishlist-remove |
| `checkout/` | address-section, confirm-form, line-attention |
| `orders/` | order-status-badge, payment-status-badge, shipping-status-badge, order-item-configuration |
| `account/` | login/signup forms, measurement-form, addresses-manager, account-nav, settings-forms, customization-request-form |
| `admin/` | product-form, order-operations, payment-operations, shipping-operations, customization-operations, staff-manager, inventory-tracking-form, stock-adjustment-form, categories-manager, collections-manager, product-media-manager, instagram-status-panel, section-placeholder, use-action-toast (hook) |
| `social/` | instagram-feed, instagram-carousel |

## Config

| File | Purpose |
| --- | --- |
| `src/config/site.ts` | brand/business facts (several fields are intentional placeholders — see file comments; do not invent real values) |
| `src/config/nav.ts` | nav structure for both customer and admin shells |
| `src/config/measurements.ts` | measurement field catalog/labels |

## Scripts — `scripts/`

| Script | Purpose |
| --- | --- |
| `bootstrap-admin.mjs` | one-time first-owner-account creation (gated by `ADMIN_BOOTSTRAP_SECRET`) |
| `migrate-to-postgres.mjs` | JSON store → Postgres import |
| `export-postgres-store.mjs` | Postgres → JSON export |
| `verify-migration.mjs` | compares JSON store vs. Postgres after a migration |
| `validate-store.mjs` | read-only JSON store integrity report (`npm run validate:store`) |
| `refresh-instagram-token.mjs` | refreshes the 60-day Instagram access token |

## Docs — `docs/`

Phase-by-phase design/decision records (useful historical context, not a
conventions doc — that's what `CLAUDE.md` is for): `database-migration-plan.md`,
`phase-5d-database.md`, `phase-6b-instagram.md`, `phase-6c-orders.md`,
`phase-7a-stitching.md`, `phase-7b-measurement-snapshot.md`,
`phase-7c-orders.md`, `phase-8-order-operations.md`,
`phase-9-customization-workflow.md`, `phase-12-production-readiness.md`,
`phase-13-inventory-stock-management.md`. Two more phase docs
(`phase-10-payment-foundation.md`, `phase-11-shipping-fulfillment-foundation.md`)
currently sit at the repo root rather than in `docs/` — known inconsistency,
not yet cleaned up.

## Legacy

`legacy-site/` — the original static marketing site, preserved untouched,
excluded from lint/typecheck/build. Open `legacy-site/index.html` directly
in a browser to view it; it is not part of the Next.js app.
