# Libaas Couture Studio

Boutique application for **Libaas Couture Studio** — customer storefront + admin management, built with Next.js (App Router) + TypeScript + Tailwind CSS v4.

> **Phase 4B (current): Customer catalog browsing.** Shop, categories and collections now render the real catalog the admin manages, with pagination, sorting and full empty/loading/error states. Cart, checkout, wishlist, orders and the full product page come in later phases.
>
> Completed so far: **Phase 1** foundation · **Phase 2** design system + app shells · **Phase 3** customer accounts (auth, addresses, measurements) · **Phase 4A** admin catalog (products, categories, collections, media) · **Phase 4B** customer catalog browsing.

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

## Structure

```
src/
├── app/
│   ├── (customer)/        # /, /shop, /categories, /collections, /products,
│   │   │                  #   /search, /cart, /wishlist
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
│   ├── data/              # repository interfaces + memory & JSON-file providers
│   ├── email/             # email provider abstraction (console in dev)
│   └── lock.ts            # in-process keyed mutex for read-modify-write
├── types/                 # domain model (entities & workflow statuses)
└── middleware.ts          # /admin and /account route guards
```

## Configuration

- **Brand/business facts** live in `src/config/site.ts`. Phone, address details and hours are intentionally **empty placeholders** — fill them with real values; do not invent them.
- **Theme tokens** live in `src/app/globals.css` (`@theme`) — one place to adjust the palette/typography.
- **Environment** is validated in `src/lib/env.ts`; see `.env.example`.
- **Data provider** — `DATA_PROVIDER` selects storage: `file` (default; JSON at `.data/dev-store.json`, survives restarts, git-ignored) or `memory` (wiped each restart). A real database replaces this in a later phase, behind the same repository interfaces.
- **Customer data** (accounts, addresses, measurements) is stored via these repositories with server-side ownership checks; passwords are scrypt-hashed, sessions are HMAC-signed HttpOnly cookies with version-based invalidation.

## Deployment (later)

The project is a standard Next.js app at the repo root — importing this repository into Vercel will work without extra configuration. Set the env vars from `.env.example` in Vercel when that time comes.

Note: the local JSON data provider (`.data/dev-store.json`) is single-process and is **not** suitable for a serverless deployment; a database provider replaces it behind the same repository interfaces in a later phase.

## Legacy

The original static marketing site is preserved untouched in [`legacy-site/`](legacy-site/) — open `legacy-site/index.html` directly in a browser to view it. Brand assets were copied to `public/brand/` and `public/images/lookbook/`.
