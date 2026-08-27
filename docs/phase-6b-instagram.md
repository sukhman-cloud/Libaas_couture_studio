# Phase 6B — Instagram / Meta integration

Live Instagram posts from **@libaas_couture_studio** on the website's home
page ("From the studio's Instagram"), fetched server-side from the
official Meta API. This document is the setup guide and the decision log.

> **Status: implemented and fully tested against a conformant mock of the
> official API. NOT yet connected to the real account** — connecting
> requires a Meta app + access token that only the account owner can
> create (steps below). Until then the section simply does not render and
> the site is completely unaffected.

## API approach

**"Instagram API with Instagram Login"** on `graph.instagram.com` — the
official, current API for reading a professional account's own media (the
old Basic Display API was retired by Meta in December 2024). No scraping,
no third-party wrappers, no Instagram iframe embeds.

One request serves the whole section:

```
GET https://graph.instagram.com/me/media
    ?fields=id,caption,media_type,media_url,thumbnail_url,permalink,
            timestamp,children{id,media_type,media_url,thumbnail_url}
    &limit=12&access_token=<long-lived token>
```

## Required Meta / Instagram setup (owner steps, one time)

1. The Instagram account must be a **professional account** (Business or
   Creator) — free switch in the Instagram app under Settings → Account.
2. Create an app at **developers.facebook.com** → *My Apps → Create App*,
   and add the **Instagram API with Instagram Login** product.
3. In the product's *API setup with Instagram login*, add
   @libaas_couture_studio as an Instagram tester/connected account and
   **generate the long-lived access token** for it (the dashboard has a
   "Generate token" button after the account authorizes the app).
4. Put the token in `.env.local` as `INSTAGRAM_ACCESS_TOKEN=...`
   (and later in the hosting provider's env settings). Restart the server.
5. The token lasts **~60 days**. Refresh it any time after 24 hours with
   `node scripts/refresh-instagram-token.mjs` — it reads the current token
   from `.env.local` itself (so the secret never has to be typed on a
   command line) and prints the replacement; a monthly reminder is plenty.
   An expired token never breaks the site — the section hides and the
   server log says exactly what to run.

## Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | to enable the section | Long-lived token; server-side only, never sent to browsers, never logged. Unset ⇒ integration off, site unaffected. A MALFORMED value also only disables the section with a warning — it can never stop the site from booting. |
| `INSTAGRAM_USER_ID` | no | Defaults to `me` (the token's owner). |
| `INSTAGRAM_GRAPH_API_BASE_URL` | no | Test-only override pointing the service at a local conformant mock. Leave unset. |

All validated in `src/lib/env.ts` alongside the existing configuration.

## Data flow

```
graph.instagram.com
   ↓  one request / 15 min (server-side, token attached here only)
src/server/instagram/service.ts     ← zod schema validation
   ↓                                 ← URL sanitization (allowlist)
   ↓                                 ← in-process TTL cache + stale-while-error
InstagramPost[] view model           (no tokens, no raw API payloads)
   ↓
src/components/social/instagram-feed.tsx      (server component)
src/components/social/instagram-carousel.tsx  (client, multi-media posts)
   ↓
home page section — renders nothing at all when off/failed-with-no-cache
```

The integration touches no repository/data-provider code and therefore
works identically under `file`, `memory` and `postgres` providers.
Nothing is persisted — a 12-post feed is ephemeral display data, refetched
cheaply; persisting it would only add invalidation problems.

## Caching / revalidation

- In-process cache, **15-minute TTL** (`FEED_TTL_MS`): browsing the site
  performs at most one API call per window, comfortably inside Meta's
  rate limits, and new Instagram posts appear on the site within
  15 minutes with no manual step.
- **Stale-while-revalidate:** once the TTL passes, the cached feed is
  served IMMEDIATELY and one background refresh runs — no visitor ever
  waits on Instagram once a feed exists. One in-flight request no matter
  how many renders race (dedupe), and the home page wraps the section in
  Suspense so even the very first fetch can never delay first paint.
- **Failure back-off (60s), shared by every path:** a failed refresh —
  including at cold start with no cache — negative-caches the failure, so
  an outage can never stack 8-second attempts per visitor.
- **Cache protection:** a 200 response whose items ALL fail validation
  (API drift, hostile payload) is treated as a failure and logged — it
  can never overwrite a working feed with emptiness. A genuinely empty
  account (`data: []`) remains a valid empty feed.
- **Stale ceiling (24h):** Instagram's CDN URLs are signed and go dead
  after days, so a feed older than the ceiling hides the section instead
  of rendering broken media.
- 8-second fetch timeout; every failure degrades to a hidden section,
  never to a broken page (verified by tests with the API fully down).

## Supported media & HD handling

| Instagram type | Rendering |
| --- | --- |
| `IMAGE` | `<img>` with the API's `media_url` **verbatim** — the full-resolution original, at its natural aspect ratio; the image links to the post. |
| `VIDEO` (incl. Reels) | `<video controls preload="none" playsinline>` with `media_url` (the highest-quality MP4 the API provides) and `thumbnail_url` as poster; a visible **Reel** badge; a "View on Instagram" link. |
| `CAROUSEL_ALBUM` | Accessible in-card carousel (scroll-snap, prev/next buttons, arrow keys, position counter) over every child; badge shows the media count. |
| anything else / future types | Skipped safely — never guessed at. |

**Why plain `<img>` and not `next/image`:** the optimizer re-encodes at
reduced quality, and the API provides exactly **one** source per media —
there is no variant set to build a true `srcset` from. Serving the
original file untouched is therefore simultaneously the highest-quality,
retina-sharp and only-correct option (verified byte-true in browser
tests). Lazy loading + `decoding="async"` keep it cheap; `preload="none"`
keeps videos poster-only until played. Aspect ratios are always
preserved — natural ratio for single images; a 4:5 stage with
`object-contain` (letterbox, never crop, never stretch) for videos and
carousel slides. Captions and dates render when present; every post links
to its original on instagram.com.

Note: Instagram CDN media URLs are signed and expire after a few days —
another reason the feed re-fetches on a short TTL instead of persisting.

## Security controls

- Token: environment → service module only. Attached to the request
  server-side; never in results, page HTML, client bundles or logs
  (failure logs carry status/category only — all verified by tests).
- Every byte of the response is untrusted: the body is size-capped while
  streaming (3 MB), the post count and carousel-child count are capped
  server-side (a hostile "10,000 posts" payload cannot become a DOM bomb),
  and everything is zod-schema-validated. URL allowlist — media only from
  `*.cdninstagram.com` / `*.fbcdn.net` over https, suffix-matched so
  `evilcdninstagram.com` can never pass, with embedded credentials and
  explicit ports rejected outright; permalinks only to `instagram.com`
  under the same rules. A failing item is skipped; one bad item never
  takes the feed down — and a response where nothing survives cannot wipe
  a working feed. Captions render as React text (auto-escaped).
- Outbound links: `target="_blank"` + `rel="noopener noreferrer"`.
- Expired/invalid tokens (OAuth code 190) degrade gracefully and log the
  exact recovery command.

## Tests (all green — details in the phase report)

Service unit/integration 65; HTTP E2E 43 (media sources, badges, hostile
items, secrets, caching, stale serving, empty account, expired token, API
fully down, unconfigured, refresh script); real-browser 34 (byte-true
intrinsic resolution, aspect-ratio preservation, video source/poster,
carousel keyboard + counter, failed-media grace, 10 viewports without
horizontal overflow, axe-core WCAG A/AA zero serious/critical); plus the
full site regression battery, typecheck, lint, production build, and a
client-bundle secret scan.

## Known limitations

- **Not connected to the real account yet** — awaiting the owner's Meta
  app + token (steps above). All flows verified against a conformant mock.
- Token refresh is manual-but-scripted (~every 60 days); a future phase
  can persist rotating tokens server-side if that ever becomes a burden.
- The API exposes no per-media dimensions and only one resolution per
  media; layout reserves space via the 4:5 stage for video/carousel and
  accepts natural-height flow for single images.
- Feed freshness is the cache TTL (≤15 minutes), by design.
