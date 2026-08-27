import Link from "next/link";
import { Clapperboard, ExternalLink, Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InstagramCarousel } from "@/components/social/instagram-carousel";
import {
  getInstagramFeed,
  type InstagramPost,
} from "@/server/instagram/service";

/**
 * Server-rendered Instagram feed section (Phase 6B).
 *
 * Renders nothing at all when the integration is unconfigured or the API
 * is down with no cached feed — the surrounding page never depends on
 * Instagram being reachable. Only the sanitized view model reaches this
 * markup: no tokens, no raw API payloads.
 *
 * MEDIA QUALITY: images and videos use the API's `media_url` directly —
 * the highest-quality source the official API provides — through plain
 * <img>/<video> tags. Deliberately NOT next/image: the optimizer would
 * re-encode at reduced quality and the API offers exactly one source per
 * media (no srcset variants exist to choose between), so the original
 * full-resolution file IS the responsive-and-retina-sharp option.
 * Aspect ratios are always preserved: single images render at their
 * natural ratio; videos and carousel slides sit in a 4:5 stage with
 * object-contain (letterboxed, never cropped, never stretched).
 */

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function postLabel(post: InstagramPost): string {
  const what =
    post.kind === "video"
      ? "Instagram reel"
      : post.kind === "carousel"
        ? "Instagram carousel post"
        : "Instagram post";
  const when = post.timestamp
    ? ` from ${dateFormatter.format(new Date(post.timestamp))}`
    : "";
  return `${what}${when} by Libaas Couture Studio`;
}

function PostMedia({ post }: { post: InstagramPost }) {
  if (post.kind === "carousel") {
    return <InstagramCarousel items={post.media} postLabel={postLabel(post)} />;
  }

  const media = post.media[0];
  if (media.kind === "video") {
    return (
      <div className="aspect-[4/5] w-full bg-cream-100">
        <video
          src={media.url}
          poster={media.posterUrl}
          controls
          preload="none"
          playsInline
          className="size-full object-contain"
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  // Natural aspect ratio, full quality — the whole image links to the post.
  return (
    <Link
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open this ${postLabel(post)} on Instagram`}
      className="block bg-cream-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt={post.caption ? post.caption.slice(0, 120) : postLabel(post)}
        loading="lazy"
        decoding="async"
        className="h-auto w-full"
      />
    </Link>
  );
}

export async function InstagramFeed() {
  const feed = await getInstagramFeed();
  if (feed.status !== "ok" || feed.posts.length === 0) return null;

  return (
    <ul
      aria-label="Latest Instagram posts"
      className="mt-10 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3"
    >
      {feed.posts.map((post) => (
        <li key={post.id}>
          <article
            aria-label={postLabel(post)}
            className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-sm"
          >
            <div className="relative">
              <PostMedia post={post} />
              {post.kind === "video" && (
                <span className="pointer-events-none absolute left-3 top-3">
                  <Badge tone="navy" className="gap-1">
                    <Clapperboard className="size-3.5" aria-hidden />
                    Reel
                  </Badge>
                </span>
              )}
              {post.kind === "carousel" && (
                <span className="pointer-events-none absolute left-3 top-3">
                  <Badge tone="navy" className="gap-1">
                    <Images className="size-3.5" aria-hidden />
                    {post.media.length} in post
                  </Badge>
                </span>
              )}
            </div>

            <div className="space-y-2 px-4 py-4 sm:px-5">
              {post.caption && (
                <p className="line-clamp-2 text-sm text-ink" title={post.caption}>
                  {post.caption}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {post.timestamp && (
                  <time
                    dateTime={post.timestamp}
                    className="text-xs text-muted"
                  >
                    {dateFormatter.format(new Date(post.timestamp))}
                  </time>
                )}
                <Link
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-700 underline-offset-4 hover:underline"
                >
                  View on Instagram
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
