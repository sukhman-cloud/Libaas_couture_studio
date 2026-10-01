# CLAUDE.md

Guidance for Claude Code (and any other AI agent) working in this repository.

## What this is

Libaas Couture Studio — a real, production boutique application: a customer
storefront (catalog, cart, checkout, accounts) plus an admin management
system (orders, payments, inventory, staff, customizations, etc.), serving
an actual boutique business. See `ai/PROJECT.md` for the full feature/business
picture. This is not a demo or template — changes here affect a real store,
real customer data and (via the Postgres provider) a real production
database.

## Stack

- **Next.js 15** (App Router), **React 19**, **TypeScript** (strict mode)
- **Tailwind CSS v4** — theme tokens via `@theme` in `src/app/globals.css`
- **Prisma 6** + **PostgreSQL** (Neon) for the production data provider
- **Zod** for input validation (forms, env vars)
- Path alias: `@/*` → `src/*`

## Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build — run this before claiming "done"
npm run lint         # ESLint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit
npm run validate:store  # read-only JSON store integrity report (safe on real data)
```

There is no automated test suite in this repo today — `lint` + `typecheck` +
`build` + `validate:store` are the full verification gate. Run all four
before considering a change complete, and after any repository/schema change
also run `validate:store` to confirm the JSON store (if you're on the `file`
provider locally) is still well-formed.

## Architecture — read this before touching data access

### The repository pattern (the most important convention in this codebase)

All data access goes through `Repositories` (interfaces defined in
`src/server/data/repositories.ts`). There are **three** interchangeable
implementations, selected at runtime by `getRepositories()`
(`src/server/data/index.ts`) based on the `DATA_PROVIDER` env var:

| `DATA_PROVIDER` | File | Behavior |
| --- | --- | --- |
| `file` (default, local dev) | `src/server/data/file.ts` | JSON file at `<DATA_DIR>/dev-store.json`, atomic writes, survives restarts |
| `memory` | `src/server/data/memory.ts` | In-memory, wiped every restart (tests/throwaway) |
| `postgres` (production) | `src/server/data/postgres/provider.ts` | Prisma + PostgreSQL |

`file.ts` and `memory.ts` are thin persistence wrappers around one shared
engine, `src/server/data/store-provider.ts` (`createStoreRepositories`,
`emptyStore`, `migrateStore`, `STORE_VERSION`). The Postgres provider is
independent but loads rows via Prisma and then runs the **same** shared
query/filter/sort predicates from `src/server/data/catalog-logic.ts` rather
than re-encoding filtering rules in SQL — this is what guarantees a query
behaves identically no matter which provider is serving it.

**The rule this repo enforces everywhere:** any change to a repository
interface in `repositories.ts` must be implemented in **all three**
providers (`store-provider.ts` covers memory+file; `postgres/provider.ts`
covers Postgres). Any shared filter/sort/search logic belongs in
`catalog-logic.ts`, never duplicated per-provider. Never call a concrete
store directly — always go through `getRepositories()`.

Prisma's schema (`prisma/schema.prisma`) is a direct relational translation
of `src/types/domain.ts` — "it invents nothing" (its own header comment).
Conventions there: app-supplied TEXT ids (no DB-generated ids), app-managed
timestamps (no `@updatedAt`/`@default(now())`), money as integer paise
(BigInt) + a currency column, `onDelete: Restrict` everywhere (no hard
deletes — records are archived, never destroyed).

**When you add/change a Prisma model:** write a migration under
`prisma/migrations/`. Do **not** run `prisma migrate deploy` against
production yourself — that is a human-authorized action in this project
(see "Things that require explicit human authorization" below).

### Domain types — the single source of truth

`src/types/domain.ts` defines every domain entity and status enum used
across customer/admin/server code. Read it before adding a new concept —
check whether the type already exists (sometimes as an unimplemented
placeholder: `Alteration`, `Quote`, `Review`, `AuditLog`, `Appointment` are
all declared in `domain.ts` today but have **no** backing Prisma model or
repository yet — don't assume a type's existence means the feature is
built; grep for a matching repository interface to confirm).

### Server-side structure

- `src/server/<domain>/` — one directory per business domain (orders,
  payments, shipping, inventory, customization, customers, staff, analytics,
  audit, stitching, cart, checkout, catalog, instagram, email, storage,
  account). Within a domain, the convention is:
  - `service.ts` — core business logic (both customer- and admin-reachable)
  - `admin.ts` — admin-only reads/mutations, always gated by `authorizeAdmin()`
  - `workflow.ts` — the status state machine for that domain (allowed
    transitions, labels) — **status transitions are always validated through
    these, never mutated directly**
  - `webhooks.ts` (payments/shipping) — provider-agnostic, idempotent
    webhook processing seams; currently unwired to a real provider (see
    "Known incomplete/foundation-only areas")
- `src/server/data/` — the repository layer described above
- `src/server/lock.ts` — keyed in-process async mutex (`withLock`). Lock
  order is always **domain lock → store lock**, never the reverse, and
  never a second `withLock` inside a transaction callback (that is the one
  way to create a deadlock cycle). `src/server/account/security.ts`
  (`mutateAccount` for customers, `mutateAdminAccount` for staff) is the
  required entry point for security-sensitive account mutations — it takes
  the lock, opens a transaction, **re-reads** the row inside it, then
  mutates. Follow this pattern for any new account-state mutation; do not
  read-then-write across an await without it.

### `src/lib/` — server actions and plain utilities

Every file named `actions.ts` / `*-actions.ts` is a `"use server"` module —
Next.js Server Actions, one per domain, called from client components via
`useActionState`. Everything else in `src/lib/` (auth guards/session/
password/roles/tokens, validation schemas, `env.ts`, `utils.ts`) is a plain
utility module with no `"use server"` directive. Keep this split: never put
business logic directly in an `actions.ts` file — it should call into
`src/server/<domain>/admin.ts` or `service.ts` and just adapt
`FormData`/`revalidatePath`.

### Auth & authorization — security-critical, read before touching

- Two independent session systems, same signing primitive
  (`src/lib/auth/signed-token.ts`, HMAC-SHA256): admin sessions
  (`src/lib/auth/session.ts`) and customer sessions
  (`src/lib/auth/customer-session.ts`). Cookies are HttpOnly; `SESSION_SECRET`
  signs both.
- **Admin role is never trusted from the token.** `getAdminSession()`
  re-derives the role server-side on every call by reading the `AdminUser` →
  `Role` rows fresh from the repository. The 4 roles (`owner`, `manager`,
  `tailor`, `staff`) and their fixed permission vocabulary live in
  `src/lib/auth/roles.ts` (`rolePermissions`) and `src/types/domain.ts`
  (`Permission`, `RoleName`). Every admin mutation must call
  `authorizeAdmin("<permission>")` or `requireAdminSession()` server-side —
  never gate a mutation on a client-side role check alone.
- **There is no public admin signup, ever.** The only ways an admin account
  can be created: `scripts/bootstrap-admin.mjs` (one-time, gated by
  `ADMIN_BOOTSTRAP_SECRET`, refuses if any admin already exists) or
  `createStaffAccount` in `src/lib/auth/actions.ts` (requires an
  authenticated admin holding `staff.manage`). Do not add any code path that
  lets a customer account become an admin account.
- `sessionVersion` on `AuthCredential` is monotonic — a password change,
  reset, or account deactivation bumps it by exactly one, invalidating every
  older session. The repository layer **rejects** any update that would
  move it backwards. Preserve this invariant in any new mutation that
  touches credentials.
- `src/middleware.ts` is a fast, cookie-presence-only UX redirect for
  `/admin/*`, `/account/*`, `/checkout/*` — it is **not** the real security
  boundary. The real, cryptographically-verified check happens server-side
  in `admin/(protected)/layout.tsx` and `(customer)/account/layout.tsx` via
  `getAdminSession()` / the customer equivalent. Never rely on middleware
  alone to protect a route.

### Money, snapshots, and historical-data rules

- All money is an integer in paise (`Money { amount: number; currency }`),
  never a float. `Order.total = subtotal + shipping + tax − discount`
  always holds; shipping/tax/discount are explicit zero amounts today, not
  absent fields — don't "simplify" them away.
- Orders, payments and shipments are **historical snapshots**. An
  `OrderItem`'s measurement snapshot, price snapshot, and the order's
  customer/address snapshot are copied at order-creation time and must never
  be re-derived from the live/current product, profile, or customer record.
  If you're tempted to "join to the current data instead of the snapshot,"
  don't — that's the bug class this architecture is built to prevent.

### Mobile-first UI conventions

- Design tokens live in `src/app/globals.css` under an `@theme` block —
  components must consume tokens (`--color-primary`, `--color-surface`,
  etc.), never raw hex values. Palette: navy (primary), gold (accent, 600/700
  shades tuned for ≥4.5:1 contrast), cream (surfaces). Fonts: Cormorant
  (display/serif) + Jost (sans), via `next/font`.
- Reuse `src/components/ui/*` for every new control — it's the full
  design-system primitive set (button, badge, table, modal, confirmation
  dialog, pagination, form-field, toast, dropdown, tabs, etc.). Don't
  hand-roll a new button/modal/table style.
- The established dense-data pattern: `RowCard`/`RowCardList` (mobile,
  stacked cards) + `Table` (`sm:`/desktop) rendering the **same** data —
  see any admin list page (`src/app/admin/(protected)/orders/page.tsx` is a
  good reference) for the exact structure to copy.
- Destructive actions always use `ConfirmationDialog` — never a raw
  `window.confirm()`.
- Minimum touch target: 44px. Breakpoint convention: `lg:` (1024px) is
  "desktop" throughout the admin UI.

## Known incomplete / foundation-only areas

Don't assume a concept exists just because a type or nav entry exists —
confirm by checking for a matching repository interface and provider
implementation.

- **Admin pages that are still pure placeholders** (`AdminSectionPlaceholder`,
  no data fetching): Appointments, Alterations, Quotes, Reviews, Offers,
  Settings. `Alteration`, `Quote`, `Review`, `AuditLog`, `Appointment` exist
  as TypeScript types in `domain.ts` but have no Prisma model, no repository,
  and no provider implementation — building any of these for real requires a
  new migration (see the Prisma note above) plus both provider
  implementations, not just UI.
- **Payment/shipping webhooks are wired but inert.** `/api/payments/webhook`
  and `/api/shipping/webhook` both return 501 — the idempotent processing
  logic (`src/server/payments/webhooks.ts`, `src/server/shipping/webhooks.ts`)
  is implemented and ready, but no real gateway/carrier is connected yet.
- **Email provider is console-only.** `src/server/email/index.ts` prints
  password-reset links to the server log — correct for local dev, **not**
  safe for production as-is (anyone with log access could take over an
  account via a leaked reset link). A real provider (Resend/SES/Postmark)
  must be implemented behind the existing `EmailProvider` interface before
  this is production-safe for password resets.
- **Instagram feed** is fully implemented but optional — it silently shows
  nothing if `INSTAGRAM_ACCESS_TOKEN` is unset; nothing else breaks.

## Things that require explicit human authorization — do not do these autonomously

- Running `prisma migrate deploy` (or any migration) against the **production**
  database.
- Modifying production environment variables.
- Touching `.data/` destructively, or deleting any `.bak` backup file the
  store creates — these are the fail-closed recovery mechanism; see
  `README.md` → "Data safety."
- Committing or pushing — only do this when explicitly asked for that
  specific change.
- Running the bootstrap-admin script, or anything that could create/alter a
  real admin account, against anything but a local/throwaway store.

## Workflow for a typical task

1. **Read before writing.** Check `repositories.ts` and the relevant
   `src/server/<domain>/` files for what already exists before adding a new
   repository method, service function, or UI pattern. Don't duplicate
   existing business logic or build a parallel data-access path.
2. Implement the server-side logic first (repository → service/admin →
   server action), keeping both the file/memory and Postgres providers in
   parity for any repository change.
3. Build the UI from `src/components/ui/*` primitives, following the
   RowCard+Table mobile/desktop pattern for lists.
4. Run `npm run typecheck && npm run lint && npm run build` — all three must
   be clean. If you touched the JSON store shape, also run
   `npm run validate:store`.
5. Report exactly what changed (files, migrations if any, auth/permission
   implications) — don't claim a feature is "done" if its backend is a stub
   or the UI is wired to fake/placeholder data.
