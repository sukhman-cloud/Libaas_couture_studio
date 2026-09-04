# Phase 12 — Production Readiness & Final System Hardening

A systematic audit of Libaas Couture Studio across security, data
integrity, concurrency, error handling, accessibility, SEO, and
production configuration — Phases 1–11 inspected, genuine gaps fixed,
everything already correct left untouched.

## Audit scope

Full read-through of: authentication (`src/lib/auth/*`), authorization
across every customer/admin service and action file, injection surfaces
(raw SQL, `dangerouslySetInnerHTML`, redirects, path handling, media
storage), the Phase 10 payment foundation, the Phase 11 shipping
foundation, the order/checkout transaction, concurrency/locking discipline
in `store-provider.ts` and `postgres/provider.ts`, idempotency backstops
(unique constraints + duplicate-key handling), Prisma schema indexes,
JSON store hardening (atomic write, corruption recovery, version
migration), error handling and logging across every server module,
environment configuration (`.env.example`, `src/lib/env.ts`), middleware,
security headers, dependencies, SEO/metadata, and a spot-check of
accessibility in key interactive components.

## Issues found and fixed

| Severity | Area | Finding | Fix |
|---|---|---|---|
| Medium | Migration tooling | `scripts/lib/db-to-store.mjs`, `migrate-to-postgres.mjs`, `verify-migration.mjs` had **zero handling for `payments`/`shipments`** (Phases 10–11 never updated them) — a Postgres migration would silently drop every payment and shipment row, and verification would never notice because it didn't check those tables at all | Added full read/write/count/verify support for all 7 new tables (`payments`, `paymentAttempts`, `paymentActivities`, `paymentWebhookEvents`, `shipments`, `shipmentActivities`, `shipmentWebhookEvents`) across all three scripts plus the shared `db-to-store.mjs` module; bumped the reconstructed store version from 7 to 9 to match `STORE_VERSION` |
| Medium | Security headers | No `headers()` config in `next.config.ts` — no `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` set anywhere globally | Added baseline security headers site-wide, plus explicit `Cache-Control: private, no-store` on `/account`, `/checkout`, `/admin` so an intermediate cache can never serve one session's private page to another. No CSP added — see "known limitations" |
| Medium | SEO | No `robots.txt`/`sitemap.xml`; admin routes had no `robots: noindex` metadata anywhere | Added `src/app/robots.ts` (disallows `/admin`, `/account`, `/checkout`, `/api`) and `src/app/sitemap.ts` (published products/categories/collections only, reusing the existing `listPublished*` functions — draft/archived content was already excluded by that layer). Added `src/app/admin/layout.tsx` with `robots: {index:false, follow:false}` covering both `/admin/login` and the protected shell (defense in depth alongside robots.txt) |
| Low | XSS defense-in-depth | Product page JSON-LD (`dangerouslySetInnerHTML`) used bare `JSON.stringify`, which does not escape `</script>` — a product name/description containing that sequence could break out of the script block. Not exploitable today (only admins write product content) but cheap to close | Escape `<` to `<` before injecting |
| Low | Accessibility | Admin mutation result messages (order status, payment recording, shipment operations, internal notes) used color alone with no `aria-live` region — inconsistent with the checkout form's existing pattern in the same codebase | Wrapped every admin mutation result message in `role="status" aria-live="polite"` across `order-operations.tsx`, `payment-operations.tsx`, `shipping-operations.tsx` |

## Issue investigated and reverted (documented instead)

**Dev-only email provider** (`src/server/email/index.ts`): the only
`EmailProvider` implemented prints password-reset links to the server
console — correct for local development, unsafe for a real deployment
where log/console access would let someone read another customer's reset
link. I initially added a Zod-schema boot-time guard
(`NODE_ENV=production` requires an explicit acknowledgement env var) — **this
broke every production build**, because `next build` itself runs with
`NODE_ENV=production` before any deployment-specific configuration exists,
and the guard fired during static page generation. Caught by actually
running `npm run build` and checking the real exit status (the first run's
exit code was masked by a `| tail` pipe — a good reminder to check
unmasked exit codes). Reverted the code change; documented the risk
prominently in `.env.example` instead, with the concrete action required
before production (implement a real `EmailProvider` — Resend/SES/Postmark/
etc. — behind the existing interface).

## Already-correct areas (verified, not touched)

- **Authentication**: scrypt password hashing (salted, NFKC-normalized,
  timing-safe verify); HMAC-SHA256 signed sessions with timing-safe
  verification for both admin and customer; `sessionVersion` revocation on
  password change/reset/deactivation; password reset tokens hashed at
  rest, single-use, 30-minute TTL, generic error messages (no
  enumeration oracle); login timing-oracle closure via dummy-hash
  comparison; per-email brute-force throttling.
- **Authorization**: every customer-owned read/write traced (orders,
  payments, shipments, customization requests, measurements, addresses,
  cart, wishlist) derives identity from the server session and checks
  `row.userId === user.id`; every admin mutation calls `authorizeAdmin`
  with a specific permission. No missing ownership check found anywhere.
- **Injection surfaces**: no raw SQL anywhere (pure Prisma throughout); no
  open-redirect patterns (`safeInternalPath`/`safeReturnPath` reject
  protocol-relative and scheme-bearing paths); media storage is
  path-traversal-safe (`assertSafeKey` regex enforced on every operation,
  lookup by opaque UUID never a filesystem path from the request).
- **Payment security** (Phase 10): amount/currency always derived from
  `order.total`, never client input; webhook route unconditionally returns
  501 without parsing the body; no secrets in `Payment`/`PaymentActivity`
  metadata; payment attempts are create-only, never updated or deleted.
- **Shipping security** (Phase 11): status/method are the only
  admin-supplied fields (no amount field exists on `Shipment` at all);
  webhook route unconditionally returns 501; delivery address is never
  duplicated — every reader re-derives it from `Order.shippingAddress`;
  shipment activity is create-only.
- **Order/checkout integrity**: `createOrderFromCheckout` still takes the
  customer lock, opens one transaction, re-reads every fact inside it,
  re-validates price against the live product record, and commits
  order+items+activity+cart-clear atomically — unbroken by the
  order-activity additions layered on in later phases.
- **Concurrency**: no domain lock is ever taken inside a `transaction`
  callback anywhere in the payment or shipping services; the
  compare-and-set `transitionStatus` pattern is used consistently for
  order, payment, and shipment status changes in both the JSON store and
  Postgres providers.
- **Idempotency**: real Postgres unique constraints back every case that
  matters — `Order(userId, idempotencyKey)`, `Payment.orderId`,
  `PaymentAttempt(paymentId, idempotencyKey)`, `Shipment.orderId`,
  `PaymentWebhookEvent(provider, providerEventId)`,
  `ShipmentWebhookEvent(carrier, providerEventId)` — with application-level
  duplicate-key catch-and-replay on every one.
- **Data integrity / indexes**: no missing index found on any
  frequently-queried foreign key; `Payment.orderId`/`Shipment.orderId` are
  unique (auto-indexed); activity tables use composite
  `@@index([parentId, createdAt])` matching their actual query pattern.
- **JSON store hardening**: `STORE_COLLECTION_KEYS`/`emptyStore`/
  `migrateStore`/`restoreStore` all stayed in sync through the Phase 10–11
  additions (a missed collection would be a TypeScript compile error, not
  a silent gap); atomic write (temp file + rename with retry), corruption
  backup/recovery chain, and fail-closed boot behavior in the file
  provider are sound.
- **Error handling / logging**: no password hash, session token, reset
  token, or payment/shipping secret is ever logged; every `console.error`
  in the server logs only `error.message`, never a raw error object or
  stack trace; no API route ever echoes a raw error back to the client.
- **Environment configuration**: `SESSION_SECRET`/`ADMIN_DEV_PASSWORD`/
  `DATABASE_URL` are server-only (enforced by the `"server-only"` import
  making a client import a build error) and absent from any
  `NEXT_PUBLIC_*` variable; `.env.example` contains no real secrets;
  `env.ts` fails fast on invalid configuration.
- **Middleware**: `/admin/*` (except login) and `/account/*`+`/checkout/*`
  are correctly gated by cookie presence as a fast UX check, with the real
  cryptographic verification happening server-side in each layout;
  `/api/payments/webhook` and `/api/shipping/webhook` correctly sit
  outside the middleware matcher since they have no session to check.
- **Accessibility**: the shared `Modal` component uses the native
  `<dialog>` element, giving real focus-trapping and Escape-to-close for
  free; the checkout confirmation form already used `aria-live`/`role="status"`
  correctly (the pattern now-extended to admin operations).

## Known remaining limitations

These are documented, deliberate, out-of-scope-for-this-phase items — not
oversights:

1. **Email delivery is dev-only.** See above — implementing a real
   `EmailProvider` requires external credentials the project does not
   have; documented in `.env.example` as a blocking pre-production step.
2. **Admin roles are decorative.** `src/lib/auth/roles.ts` defines a full
   `owner`/`manager`/`tailor`/`staff` permission matrix, but the only
   admin session obtainable today is a single shared dev password that
   always mints `role: "owner"`. Every admin action is effectively
   unrestricted in practice until real per-staff admin accounts exist —
   a pre-existing Phase 1 placeholder, not something Phase 12 changed.
3. **No Content-Security-Policy.** Deliberately not added: the app renders
   third-party media (Instagram CDN images, Google Fonts, locally-uploaded
   product photos), and a CSP tight enough to matter but not break those
   sources needs a real audit of every external origin in use — adding a
   permissive "allow everything" CSP would be security theater, not
   hardening. Flagged as the next concrete step for whoever owns the
   eventual production deploy.
4. **`npm audit` reports 6 high-severity advisories**, all in build
   tooling (not runtime-exploitable via customer input in this app's
   current usage): `deepmerge-ts` (via Prisma 6.x), `postcss` and `sharp`
   (both bundled inside Next.js 15.x). Every fix requires a breaking major
   upgrade (Prisma 7/8, Next 16) — explicitly out of scope per this
   phase's "do not perform risky major upgrades" instruction. Recommend
   scheduling the Next 16 / Prisma 7 migration as a deliberate, isolated
   piece of work with its own full regression pass, not bundled into a
   hardening phase.
5. **No automated test framework exists** in this repository (confirmed —
   no Jest/Vitest/Playwright dependency, no `test` script). Reported
   honestly rather than fabricated; validation for this phase relied on
   `tsc --noEmit`, `prisma validate`, the JSON store validator, lint, and a
   full production build.
6. **JSON store is local/development-only.** This was already true and is
   restated here explicitly per the phase brief: the JSON file provider
   (`DATA_PROVIDER=file`) has no cross-process locking, no real
   transaction isolation, and a single-writer assumption baked into its
   design (documented in `src/server/data/repositories.ts`). It is
   suitable for local development and single-instance testing only. A
   real production deployment must use `DATA_PROVIDER=postgres` with a
   real `DATABASE_URL`.

## Security considerations

- No client-controlled identity, status, or monetary amount was found
  anywhere in the audited surface — every mutation re-derives its
  authoritative values from a server-side re-read inside a lock/transaction.
- No secrets (passwords, session tokens, reset tokens, payment/shipping
  "credentials") are logged, stored in `metadata` fields, or ever appear
  in a client-facing response.
- Payment and shipping webhook endpoints are correctly inert (501,
  no body parsing) until a real provider's signature verification is
  wired in — they were built this way in Phases 10–11 and Phase 12
  confirmed nothing regressed that discipline.

## Environment requirements

See `.env.example` for the full, current list. Required for any
deployment: `SESSION_SECRET` (≥16 chars), `ADMIN_DEV_PASSWORD` (≥8 chars,
until real staff accounts exist), `NEXT_PUBLIC_SITE_URL`. Required only
for `DATA_PROVIDER=postgres`: `DATABASE_URL`. A real `EmailProvider` must
be implemented before production traffic reaches password reset (see
"known remaining limitations" above) — there is no environment variable
that changes this; it requires a code change.

## Database requirements / JSON vs PostgreSQL guidance

- **Local development**: `DATA_PROVIDER=file` (default) — the JSON store
  at `<DATA_DIR>/dev-store.json`, atomic-write, corruption-recovering,
  fully sufficient for one developer working locally.
- **Production**: `DATA_PROVIDER=postgres` with a real `DATABASE_URL`.
  Apply the schema with `npx prisma migrate deploy`, then (for an existing
  JSON store being cut over) `node scripts/migrate-to-postgres.mjs`
  followed by `node scripts/verify-migration.mjs` — both scripts now
  correctly cover every table including payments and shipments (the gap
  this phase fixed). Neither script was run against a live database in
  this phase — no database was created, reset, or touched, per the
  phase's explicit instruction.

## Payment provider status

Unchanged from Phase 10: **no real payment gateway is connected.** The
payment domain (statuses, transitions, activity log, webhook processing
function) is fully built and production-shaped, but the actual HTTP
webhook endpoint refuses all traffic (501) until a real provider's secret
and signature verification are wired in. Connecting Razorpay/Stripe/etc.
was explicitly out of scope for this phase.

## Shipping provider status

Unchanged from Phase 11: **no real carrier is connected.** Same shape as
payments — the shipment domain and webhook processing function are built
and tested at the code level, but the webhook route refuses all traffic
until a real carrier integration exists. Connecting Shiprocket/Delhivery/
etc. was explicitly out of scope for this phase.

## Deployment checklist

Before taking this application to production:

1. Set `DATA_PROVIDER=postgres` and a real `DATABASE_URL`; run
   `npx prisma migrate deploy`.
2. If cutting over from an existing JSON store: run
   `node scripts/migrate-to-postgres.mjs` then
   `node scripts/verify-migration.mjs`; do not proceed until it reports
   zero differences.
3. Set a real, random `SESSION_SECRET` (never reuse the development value).
4. Replace `ADMIN_DEV_PASSWORD` with real per-staff admin accounts before
   giving anyone but the owner admin access (see "known limitations" §2).
5. Implement and wire in a real `EmailProvider` (see "known limitations" §1)
   — do not deploy with the console provider still active.
6. Set `NEXT_PUBLIC_SITE_URL` to the real production origin (used by
   `robots.ts`, `sitemap.ts`, and page metadata).
7. Fill in the real business details in `src/config/site.ts` (contact,
   address, hours) — several fields are still documented placeholders.
8. Decide on and implement a Content-Security-Policy scoped to the
   specific external origins actually in use (Instagram CDN, Google
   Fonts) before relying on it as a defense layer.
9. Schedule the Next.js 16 / Prisma 7+ upgrade separately, with its own
   full regression pass, to close the `npm audit` findings.
10. Confirm real payment/shipping provider integrations are ready (both
    remain foundation-only as of this phase).

## Backup / recovery considerations

- **JSON store**: the file provider already writes a timestamped `.bak`
  before every version-upgrade write and recovers automatically from the
  newest valid backup if the live file is found corrupt at boot (existing
  behavior, unchanged this phase, verified still working across the
  Phase 10–11 collection additions).
- **PostgreSQL**: standard database backup practices apply (point-in-time
  recovery / scheduled snapshots via the hosting provider) — outside this
  application's own responsibility, and outside this phase's scope.
- **Rollback path**: `scripts/export-postgres-store.mjs` can always turn a
  live Postgres database back into a JSON store file (now correctly
  including payments/shipments after this phase's fix), for switching back
  to the file provider if ever needed.

## Recommended pre-production checks

- Run `node scripts/validate-store.mjs` against the real store before any
  migration attempt — it must report READY.
- Run `node scripts/migrate-to-postgres.mjs --dry-run` against the target
  database first; only run for real once the dry run succeeds.
- Run `node scripts/verify-migration.mjs` immediately after a real
  migration and require zero differences before switching
  `DATA_PROVIDER`.
- Manually verify the security headers are present on a real deployed
  response (`curl -I`) — `next.config.ts`'s `headers()` function requires
  the framework's own server to apply them; a static export or edge
  runtime configuration could behave differently and should be checked.
- Manually smoke-test password reset end-to-end against whatever real
  `EmailProvider` gets implemented before relying on it.

## Validation performed

- `npx tsc --noEmit` — passes with no errors.
- `npx prisma validate` — schema valid (no schema changes were made this
  phase; the audit found no data-integrity gap requiring one).
- `npx prisma generate` — not needed (schema unchanged), but confirmed
  the existing generated client still matches via `tsc --noEmit` and the
  full build.
- `npm run validate:store` — passes against the real `.data/dev-store.json`
  (untouched, still version 9).
- `npm run lint` — passes (2 pre-existing, unrelated warnings; no new
  warnings introduced).
- `npm run build` — production build succeeds. **Caught a real regression
  during this phase**: an earlier attempt to add a boot-time guard for the
  dev email provider broke every production build because `next build`
  itself sets `NODE_ENV=production` before deployment configuration
  exists; caught by checking the actual (unmasked) exit code rather than
  trusting a piped `tail` output, and reverted in favor of documentation.
- Migration/import/export scripts (`migrate-to-postgres.mjs`,
  `verify-migration.mjs`, `export-postgres-store.mjs`,
  `scripts/lib/db-to-store.mjs`) — syntax-verified (`node --check`) after
  adding full payments/shipments coverage; not run against a live
  database, per this phase's explicit "do not reset or touch databases"
  instruction. The existing gap (payments/shipments silently dropped on
  migration) is now closed at the code level.
- No automated test framework exists in this repository — reported
  honestly rather than fabricating a test run, matching every prior
  phase's precedent.
