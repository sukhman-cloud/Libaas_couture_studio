import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Instagram feed service (Phase 6B) — the ONLY module that talks to the
 * Meta/Instagram Graph API.
 *
 * API: "Instagram API with Instagram Login" on graph.instagram.com — the
 * official, current API for reading a professional account's own media
 * (the old Basic Display API was retired in December 2024). One request:
 *
 *   GET /{user}/media?fields=id,caption,media_type,media_url,
 *       thumbnail_url,permalink,timestamp,children{...}&limit=N
 *
 * `media_url` is the highest-quality media source the official API
 * provides (full-resolution CDN image / MP4); `thumbnail_url` is the
 * poster for videos. There is no higher-quality source to prefer and no
 * multi-resolution variant set, which is why the UI renders `media_url`
 * directly and untouched.
 *
 * DESIGN RULES
 * - The access token lives in the environment, is appended to the request
 *   server-side, and never appears in results, logs or errors. Every
 *   error path logs status/category only — never the URL.
 * - Every byte coming back from the API is untrusted: the response body
 *   is size-capped while streaming, schema-validated (zod), bounded in
 *   cardinality (post and carousel-child caps), and every URL sanitized
 *   against an allowlist (https, Instagram/Meta CDN hosts only, no
 *   embedded credentials, no explicit ports). An item that fails any
 *   check is SKIPPED — one bad item never takes the feed down — and a
 *   response where NOTHING survives is treated as a failure rather than
 *   allowed to wipe a working feed.
 * - Caching is stale-while-revalidate in process: a fresh cache serves
 *   directly; an expired one serves IMMEDIATELY while one background
 *   refresh runs (no visitor ever waits on Instagram once a feed
 *   exists); failures arm a shared back-off so neither a broken nor a
 *   missing cache can hammer the API. Stale content is served for at
 *   most MAX_STALE_MS — Instagram's CDN URLs are signed and expire, so
 *   an outage older than that hides the section instead of rendering
 *   broken media. An Instagram outage can never break the page.
 * - Unconfigured (no token) is a first-class state, not an error — and a
 *   MALFORMED Instagram configuration only disables the section with a
 *   warning; it never prevents the site from booting.
 *
 * The view-model types below are the seam the UI depends on — the Graph
 * API specifics stay inside this file and can be swapped without touching
 * components.
 */

/* ── view model ─────────────────────────────────────────────────── */

export interface InstagramMediaItem {
  /** Child id (carousel) or the post id itself. */
  id: string;
  kind: "image" | "video";
  /** Full-quality media URL from the API — rendered as-is, never scaled. */
  url: string;
  /** Poster frame for videos, when the API provides one. */
  posterUrl?: string;
}

export interface InstagramPost {
  id: string;
  kind: "image" | "video" | "carousel";
  /** One item for image/video posts; every child for carousels. */
  media: InstagramMediaItem[];
  caption?: string;
  /** Link to the original post/reel on instagram.com. */
  permalink: string;
  /** ISO timestamp of publication, when provided. */
  timestamp?: string;
}

export type InstagramFeedResult =
  /** Feed served. `stale` marks a copy older than the TTL, served while a
   *  background refresh runs (or after one failed). */
  | { status: "ok"; posts: InstagramPost[]; fetchedAt: string; stale: boolean }
  /** No (valid) token configured — the integration is off by design. */
  | { status: "unconfigured" }
  /** No servable feed (never fetched, or too stale) — render nothing. */
  | { status: "error" };

/* ── configuration ──────────────────────────────────────────────── */

const DEFAULT_API_BASE = "https://graph.instagram.com";
export const FEED_LIMIT = 12;
/** Cardinality caps on the RESPONSE — Instagram's own maximum carousel
 *  size is well under this; anything larger is hostile or broken. */
export const MAX_CAROUSEL_CHILDREN = 20;
/** Response body ceiling. A 12-post feed is a few hundred KB at most. */
export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
/** How long a fetched feed is served before revalidating. */
export const FEED_TTL_MS = 15 * 60 * 1000;
/** Failures arm this back-off before the API is contacted again. */
export const FAILURE_BACKOFF_MS = 60 * 1000;
/** Oldest cache worth serving — signed CDN URLs go dead after days, so a
 *  feed this stale hides rather than rendering broken media. */
export const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

const FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "children{id,media_type,media_url,thumbnail_url}",
].join(",");

/**
 * Resolve and validate the Instagram configuration WITHOUT ever throwing:
 * a typo in these optional variables must only disable the section (with
 * one clear warning), never stop the whole site from booting the way the
 * critical variables in env.ts rightly do.
 */
function resolveConfig(): { token: string; user: string; base: string } | null {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return null;

  const problems: string[] = [];
  if (token.length < 20) {
    problems.push("INSTAGRAM_ACCESS_TOKEN looks truncated (under 20 characters)");
  }
  const user = env.INSTAGRAM_USER_ID ?? "me";
  if (!/^(me|\d+)$/.test(user)) {
    problems.push(
      'INSTAGRAM_USER_ID must be "me" or the numeric account id (not the @handle)',
    );
  }
  let base = DEFAULT_API_BASE;
  if (env.INSTAGRAM_GRAPH_API_BASE_URL) {
    try {
      base = new URL(env.INSTAGRAM_GRAPH_API_BASE_URL).toString().replace(/\/$/, "");
    } catch {
      problems.push("INSTAGRAM_GRAPH_API_BASE_URL is not a valid URL");
    }
  }

  if (problems.length > 0) {
    warnConfigOnce(problems);
    return null;
  }
  return { token, user, base };
}

function warnConfigOnce(problems: string[]) {
  const flag = globalThis as unknown as { __lcsInstagramConfigWarned?: boolean };
  if (flag.__lcsInstagramConfigWarned) return;
  flag.__lcsInstagramConfigWarned = true;
  console.warn(
    `[instagram] integration disabled — fix the configuration: ${problems.join("; ")}`,
  );
}

/* ── URL sanitization ───────────────────────────────────────────── */

/**
 * Hosts media may load from. Suffix-matched against ".<suffix>" so
 * lookalikes ("evilcdninstagram.com") can never pass.
 */
const MEDIA_HOST_SUFFIXES = ["cdninstagram.com", "fbcdn.net"];
const PERMALINK_HOSTS = new Set(["www.instagram.com", "instagram.com"]);

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith("." + suffix);
}

/** Shared https-URL hygiene: no embedded credentials (browsers refuse
 *  them for subresources; in links they are a spoofing primitive) and no
 *  explicit ports (the real CDN never uses one; a bogus port is a
 *  dead-end link). */
function parseCleanHttpsUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "" || url.port !== "") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** An https URL on the Instagram/Meta media CDNs, or null. */
export function sanitizeMediaUrl(raw: unknown): string | null {
  const url = parseCleanHttpsUrl(raw);
  if (!url) return null;
  if (!MEDIA_HOST_SUFFIXES.some((s) => hostMatches(url.hostname, s))) {
    return null;
  }
  return url.toString();
}

/** An https link to instagram.com itself, or null. */
export function sanitizePermalink(raw: unknown): string | null {
  const url = parseCleanHttpsUrl(raw);
  if (!url) return null;
  if (!PERMALINK_HOSTS.has(url.hostname)) return null;
  return url.toString();
}

/* ── API response schema (untrusted input) ──────────────────────── */

const childSchema = z.object({
  id: z.string().min(1),
  media_type: z.string(),
  media_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const mediaItemSchema = childSchema.extend({
  caption: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  children: z.object({ data: z.array(childSchema) }).optional(),
});

const feedResponseSchema = z.object({
  data: z.array(z.unknown()),
});

/** Instagram caption hard limit is 2,200 chars; cap defensively. */
const MAX_CAPTION_LENGTH = 2_200;

function toMediaItem(
  raw: z.infer<typeof childSchema>,
): InstagramMediaItem | null {
  const url = sanitizeMediaUrl(raw.media_url);
  if (!url) return null;
  if (raw.media_type === "IMAGE") {
    return { id: raw.id, kind: "image", url };
  }
  if (raw.media_type === "VIDEO") {
    const posterUrl = sanitizeMediaUrl(raw.thumbnail_url) ?? undefined;
    return { id: raw.id, kind: "video", url, posterUrl };
  }
  return null; // unknown media type — skip, never guess
}

/** Validate + sanitize ONE feed entry; null skips it. */
function toPost(raw: unknown): InstagramPost | null {
  const parsed = mediaItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  const permalink = sanitizePermalink(item.permalink);
  if (!permalink) return null; // a post we cannot link back to is not shown

  const caption = item.caption
    ? item.caption.trim().slice(0, MAX_CAPTION_LENGTH) || undefined
    : undefined;
  const timestamp =
    item.timestamp && !Number.isNaN(Date.parse(item.timestamp))
      ? new Date(item.timestamp).toISOString()
      : undefined;

  if (item.media_type === "CAROUSEL_ALBUM") {
    const media = (item.children?.data ?? [])
      .slice(0, MAX_CAROUSEL_CHILDREN) // cardinality cap on the RESPONSE
      .map(toMediaItem)
      .filter((child): child is InstagramMediaItem => child !== null);
    if (media.length === 0) return null;
    return { id: item.id, kind: "carousel", media, caption, permalink, timestamp };
  }

  const single = toMediaItem(item);
  if (!single) return null;
  return {
    id: item.id,
    kind: single.kind,
    media: [single],
    caption,
    permalink,
    timestamp,
  };
}

/* ── fetch ──────────────────────────────────────────────────────── */

/** Read a response body with a hard byte ceiling while streaming — a
 *  hostile multi-hundred-MB body is cut off, not buffered. */
async function readBodyCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("API response exceeded the size limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Categorize a failure for the log WITHOUT ever including the URL. */
function describeFailure(status: number, body: unknown): string {
  const code =
    typeof body === "object" && body !== null
      ? (body as { error?: { code?: number; type?: string } }).error?.code
      : undefined;
  if (status === 400 && code === 190) {
    return "access token invalid or expired — run scripts/refresh-instagram-token.mjs and update INSTAGRAM_ACCESS_TOKEN";
  }
  if (status === 429 || code === 4) return "rate limited by the API";
  return `API responded ${status}${code ? ` (error code ${code})` : ""}`;
}

async function fetchFeedFromApi(config: {
  token: string;
  user: string;
  base: string;
}): Promise<InstagramPost[]> {
  const url = new URL(`${config.base}/${config.user}/media`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", String(FEED_LIMIT));
  // The token is attached here, server-side, and appears nowhere else.
  url.searchParams.set("access_token", config.token);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // The service manages its own caching; Next must not add another.
    cache: "no-store",
  });

  const bodyText = await readBodyCapped(response);

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = JSON.parse(bodyText);
    } catch {
      /* non-JSON error body — status alone will do */
    }
    throw new Error(describeFailure(response.status, body));
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(bodyText);
  } catch {
    throw new Error("API response was not valid JSON");
  }
  const parsed = feedResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("API response did not match the expected shape");
  }

  // Cardinality cap on the RESPONSE — `limit` is only a request hint.
  const rawItems = parsed.data.data.slice(0, FEED_LIMIT);
  const posts = rawItems
    .map(toPost)
    .filter((post): post is InstagramPost => post !== null);

  // A response with items where NOTHING survives validation is a failure
  // (API drift, hostile payload, transient account weirdness) — treating
  // it as success would wipe a working feed with emptiness. A genuinely
  // empty account (`data: []`) remains a valid empty feed.
  if (rawItems.length > 0 && posts.length === 0) {
    throw new Error(
      `none of ${rawItems.length} feed items survived validation — keeping the previous feed`,
    );
  }

  return posts;
}

/* ── cache: stale-while-revalidate + back-off + stale ceiling ───── */

interface FeedCache {
  posts: InstagramPost[];
  fetchedAt: string;
  fetchedAtMs: number;
  expiresAt: number;
}

/** Cached on globalThis so dev-mode module reloads share one cache, like
 *  the data providers do. */
const globalCache = globalThis as unknown as {
  __lcsInstagramFeed?: FeedCache;
  __lcsInstagramInFlight?: Promise<InstagramPost[]>;
  __lcsInstagramFailedAt?: number;
};

/** Start (or join) the single background/foreground refresh. */
function startRefresh(config: {
  token: string;
  user: string;
  base: string;
}): Promise<InstagramPost[]> {
  if (globalCache.__lcsInstagramInFlight) {
    return globalCache.__lcsInstagramInFlight;
  }
  const started = Date.now();
  globalCache.__lcsInstagramInFlight = fetchFeedFromApi(config)
    .then((posts) => {
      globalCache.__lcsInstagramFeed = {
        posts,
        fetchedAt: new Date(started).toISOString(),
        fetchedAtMs: started,
        expiresAt: started + FEED_TTL_MS,
      };
      globalCache.__lcsInstagramFailedAt = undefined;
      return posts;
    })
    .catch((error) => {
      // Arm the back-off for cached AND cold-start paths alike, and log
      // status/category only — never the URL, never the token.
      globalCache.__lcsInstagramFailedAt = Date.now();
      console.warn(
        `[instagram] feed fetch failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      throw error;
    })
    .finally(() => {
      globalCache.__lcsInstagramInFlight = undefined;
    });
  return globalCache.__lcsInstagramInFlight;
}

function inBackoff(now: number): boolean {
  return (
    globalCache.__lcsInstagramFailedAt !== undefined &&
    now - globalCache.__lcsInstagramFailedAt < FAILURE_BACKOFF_MS
  );
}

/**
 * The feed. Fresh cache → served directly. Expired-but-usable cache →
 * served IMMEDIATELY while one refresh runs in the background (bounded by
 * the failure back-off). No cache → one foreground fetch, negative-cached
 * on failure so an outage at cold start cannot stack 8-second attempts.
 * Never throws.
 */
export async function getInstagramFeed(): Promise<InstagramFeedResult> {
  const config = resolveConfig();
  if (!config) return { status: "unconfigured" };

  const now = Date.now();
  const cached = globalCache.__lcsInstagramFeed;

  if (cached && now < cached.expiresAt) {
    return {
      status: "ok",
      posts: cached.posts,
      fetchedAt: cached.fetchedAt,
      stale: false,
    };
  }

  const staleUsable = cached && now - cached.fetchedAtMs < MAX_STALE_MS;
  if (cached && staleUsable) {
    if (!inBackoff(now)) {
      // Fire-and-forget; the rejection is consumed here and recorded by
      // startRefresh's catch (which arms the back-off).
      void startRefresh(config).catch(() => {});
    }
    return {
      status: "ok",
      posts: cached.posts,
      fetchedAt: cached.fetchedAt,
      stale: true,
    };
  }

  // No usable cache (never fetched, or older than the stale ceiling —
  // its signed CDN URLs are likely dead, so hiding beats broken tiles).
  if (inBackoff(now)) return { status: "error" };
  try {
    const posts = await startRefresh(config);
    return {
      status: "ok",
      posts,
      fetchedAt: globalCache.__lcsInstagramFeed?.fetchedAt ?? new Date(now).toISOString(),
      stale: false,
    };
  } catch {
    return { status: "error" };
  }
}
