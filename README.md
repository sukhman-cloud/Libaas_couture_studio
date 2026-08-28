# Libaas Couture Studio

Boutique application for **Libaas Couture Studio** — customer storefront + admin management, built with Next.js (App Router) + TypeScript + Tailwind CSS v4.

> **Phase 7A (current): Stitching & measurements in the cart.** Products that offer stitching can now be added **Unstitched** or **Stitched with one of the customer's measurement profiles** — validated by a single server-side configuration validator (profile ownership, archival, product capability), keyed by a server-derived `configurationKey` so the same product holds separate lines per configuration, changeable per-line in the bag (with safe quantity merging), carried into the order with a profile-label snapshot, and blocked at checkout the moment a configuration goes stale. No stitching price exists, so none is invented. Details: `docs/phase-7a-stitching.md`.
>
> **Phase 6B: Instagram integration.** The home page's social section renders the studio's latest Instagram posts — photos, reels and carousels at the API's full quality — through a server-side service over the official Meta Graph API (token never reaches the browser; cached 15 min; an Instagram outage can never break the site). Implemented and fully tested against a conformant API mock; goes live the moment the owner's Meta access token lands in `.env.local` — setup guide: `docs/phase-6b-instagram.md`.
>
> Completed so far: **Phase 1** foundation · **Phase 2** design system + app shells · **Phase 3** customer accounts (auth, addresses, measurements) · **Phase 4A** admin catalog (products, categories, collections, media) · **Phase 4B** customer catalog browsing · **Phase 4C** search, filters and product detail · **Phase 5A** wishlist + cart · **Phase 5B** pre-database hardening · **Phase 5C** account concurrency hardening · **Phase 5D** PostgreSQL + Prisma foundation · **Phase 6A** checkout foundation · **Phase 6B** Instagram · **Phase 6C** orders · **Phase 7A** stitching & measurements.

## Run locally (ਲੋਕਲ ਚਲਾਉਣ ਲਈ)

```bash
npm install
copy .env.example .env.local   # then fill SESSION_SECRET + ADMIN_DEV_PASSWORD
npm run dev
```

Open http://localhost:3000 (customer) and http://localhost:3000/admin (admin — redirects to `/admin/login`). Create a customer account at http://localhost:3000/signup.

**Password reset in local dev:** email is not wired to a real provider — reset links are printed to the **server terminal** (the console email provider). Copy the link from there to complete a reset.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (same build Vercel runs) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run validate:store` | Read-only JSON store integrity report |

## Structure

```
src/
├── app/
│   ├── (customer)/        # /, /shop, /categories, /collections, /products,
│   │   │                  #   /search, /cart, /wishlist, /checkout
│   │   │                  #   (home hosts the Instagram feed section)
│   │   ├── login, signup, forgot-password, reset-password   # auth pages
│   │   └── account/       # /account/** — session-verified (profile,
│   │                      #   addresses, measurements, settings)
│   ├── admin/
│   │   ├── login/         # public admin login
│   │   └── (protected)/   # /admin/** — session-verified shell
│   └── api/
│       ├── health/        # liveness probe
│       └── media/[id]/    # serves uploaded catalog media
├── components/
│   ├── ui/                # design-system primitives (Button, Input, Card, …)
│   ├── layout/            # header, footer, bottom nav, admin sidebar
│   ├── catalog/           # customer product card / grid / toolbar
│   ├── account/           # customer auth & account components
│   └── admin/             # admin-specific building blocks
├── config/                # site facts (placeholders!), nav, measurement catalog
├── lib/                   # env validation, auth (password/session/actions),
│   │                      #   account actions, validation schemas, utilities
│   └── ...
├── server/
│   ├── account/           # security.ts — the one seam for account mutations
│   ├── cart/              # configuration.ts — the ONE stitching validator (Phase 7A)
│   ├── checkout/          # service.ts — checkout view model + readiness (Phase 6A)
│   ├── orders/            # service.ts — the cart→order transaction (Phase 6C)
│   ├── instagram/         # service.ts — official Graph API feed (Phase 6B)
│   ├── data/              # repository interfaces + providers:
│   │   │                  #   memory, JSON file, postgres (Prisma) —
│   │   │                  #   catalog-logic.ts holds the SHARED query rules
│   │   └── postgres/      # Prisma client/mappers/provider (Phase 5D)
│   ├── email/             # email provider abstraction (console in dev)
│   └── lock.ts            # in-process keyed mutex + the customer lock key
├── types/                 # domain model (entities & workflow statuses)
└── middleware.ts          # /admin and /account route guards
```

## Configuration

- **Brand/business facts** live in `src/config/site.ts`. Phone, address details and hours are intentionally **empty placeholders** — fill them with real values; do not invent them.
- **Theme tokens** live in `src/app/globals.css` (`@theme`) — one place to adjust the palette/typography.
- **Environment** is validated in `src/lib/env.ts`; see `.env.example`.
- **Data provider** — `DATA_PROVIDER` selects storage: `file` (default; JSON at `.data/dev-store.json`, survives restarts, git-ignored), `memory` (wiped each restart), or `postgres` (PostgreSQL via Prisma; requires `DATABASE_URL`). All three implement the same repository interfaces and share one set of catalog query rules (`src/server/data/catalog-logic.ts`), so business logic never knows which one is serving. The database schema lives in `prisma/schema.prisma` with committed migrations; the JSON→PostgreSQL migration runbook is in [`docs/phase-5d-database.md`](docs/phase-5d-database.md).
- **Data directory** — `DATA_DIR` (optional) moves the JSON store *and* uploaded media somewhere else. Defaults to `.data`. Use it to run a server against an isolated store instead of real customer data.
- **Customer data** (accounts, addresses, measurements) is stored via these repositories with server-side ownership checks; passwords are scrypt-hashed, sessions are HMAC-signed HttpOnly cookies with version-based invalidation. Customer-owned records reference the owning **User** by `userId` — see the ownership rule in `src/types/domain.ts`.
- **Transactions** — `repos.transaction(fn)` runs several writes as one unit. The JSON provider commits with a single atomic file replace and rolls back in memory on failure; it is not a database and the difference is documented on the interface.

## Account concurrency

Two requests for the same customer can arrive at once — a password change from
one device while another deactivates the account, a profile save racing a
deactivation. The rules that keep those safe:

- **One lock key per account.** `customerLockKey(userId)` in `src/server/lock.ts`
  covers everything a customer owns: the User row, profile, addresses,
  measurements, cart, wishlist and credential. Operations that look unrelated
  write the same rows, so they share one key. Reads are never locked.
- **Lock order is always domain-first, store-second** — `customer:<id>` (or
  `signup:<email>`, `catalog`) outside, `store:write` inside. Never the reverse,
  and never a `withLock` inside a transaction callback; that is the one way to
  build a cycle.
- **Security-sensitive account writes go through `mutateAccount`**
  (`src/server/account/security.ts`): take the lock, open a transaction,
  **re-read** the User and credential inside it, then mutate. The re-read is the
  point — a lock alone cannot help a request that already read its row before
  taking it, which is how a profile save could revive a deactivated account.
- **`sessionVersion` only counts up.** Every session token carries the version
  it was minted with, so the repository *rejects* an update that would lower it
  rather than trusting each caller's arithmetic. Password change, password reset
  and deactivation each advance it by exactly one and invalidate every older
  session.

What this is not: multi-process isolation. The lock is a `Map` in one Node
process and the transaction is a snapshot plus one atomic file replace. That is
correct for the single long-lived server this project runs and is another reason
it must not be deployed serverless before the database migration —
`docs/database-migration-plan.md` §13a lists the exact Postgres equivalent of
each guarantee.

## Data safety

- The store refuses to start rather than come up empty when the file is unreadable, corrupt with no usable backup, or written by a newer build. A corrupt file is always preserved first, and the newest valid backup is used automatically when there is one.
- `npm run validate:store` reports entity counts, orphans, duplicate unique fields, invalid money, invalid ownership and broken media references. It never writes — safe to run against real data or a backup.
- `.data/` holds password hashes and is git-ignored. So is the store file by name at any depth, and the server drops a self-ignoring `.gitignore` into whatever directory `DATA_DIR` resolves to — so an isolated run cannot leak customer data into git either. The directory has no version history, so copy it somewhere outside the project before anything risky.
- The migration plan for moving to PostgreSQL lives in [`docs/database-migration-plan.md`](docs/database-migration-plan.md).

## Deployment (later)

The project is a standard Next.js app at the repo root, but it is **not deployed yet** and no production database is connected. With `DATA_PROVIDER=postgres` the two biggest serverless blockers (JSON store durability; store write lock) are gone; what still assumes one long-lived process:

- local media storage (`.data/media`) — uploaded images 404 from any other instance until object storage arrives;
- login throttling — per-instance counters, so the effective limit multiplies by instance count;
- the in-process domain locks — correct for one instance; multi-instance needs `SELECT … FOR UPDATE` in the postgres provider (documented in `docs/phase-5d-database.md`).

Sessions, server actions, caching and revalidation are already serverless-safe. The full blocker list lives in [`docs/database-migration-plan.md`](docs/database-migration-plan.md); the database decision log in [`docs/phase-5d-database.md`](docs/phase-5d-database.md).

## Legacy

The original static marketing site is preserved untouched in [`legacy-site/`](legacy-site/) — open `legacy-site/index.html` directly in a browser to view it. Brand assets were copied to `public/brand/` and `public/images/lookbook/`.
