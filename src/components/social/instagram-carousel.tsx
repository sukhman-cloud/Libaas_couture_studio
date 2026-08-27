"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstagramMediaItem } from "@/server/instagram/service";

/**
 * Carousel for a multi-media Instagram post. Native horizontal scrolling
 * with snap points (works without JavaScript beyond hydration), plus
 * keyboard-accessible previous/next buttons and a position indicator.
 *
 * Media is rendered at the API's full quality inside a fixed 4:5 stage
 * with object-contain — nothing is cropped, nothing is stretched; media
 * that is not 4:5 (e.g. 9:16 reels) is letterboxed on the cream ground.
 */
export function InstagramCarousel({
  items,
  postLabel,
}: {
  items: InstagramMediaItem[];
  postLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function scrollTo(next: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
  }

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={postLabel}
      className="relative"
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        // The scroll region itself is keyboard-operable (WCAG
        // scrollable-region-focusable): focus it and use the arrow keys,
        // or use the previous/next buttons.
        tabIndex={0}
        aria-label="Carousel media — use the arrow keys or the previous and next buttons"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollTo(index + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollTo(index - 1);
          }
        }}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth outline-offset-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, itemIndex) => (
          <div
            key={item.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${itemIndex + 1} of ${items.length}`}
            className="w-full shrink-0 snap-center"
          >
            <div className="aspect-[4/5] w-full bg-cream-100">
              {item.kind === "video" ? (
                <video
                  src={item.url}
                  poster={item.posterUrl}
                  controls
                  preload="none"
                  playsInline
                  className="size-full object-contain"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                // Full-quality API media, rendered as-is — see the feed
                // component for why this is deliberately not next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={`${postLabel} — media ${itemIndex + 1} of ${items.length}`}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-contain"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous media"
            disabled={index === 0}
            onClick={() => scrollTo(index - 1)}
            className={cn(
              "absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-navy-900/60 text-cream-50 backdrop-blur transition-opacity hover:bg-navy-900/80",
              index === 0 && "opacity-40",
            )}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next media"
            disabled={index === items.length - 1}
            onClick={() => scrollTo(index + 1)}
            className={cn(
              "absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-navy-900/60 text-cream-50 backdrop-blur transition-opacity hover:bg-navy-900/80",
              index === items.length - 1 && "opacity-40",
            )}
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <p
            aria-live="polite"
            className="absolute right-3 top-3 rounded-full bg-navy-900/70 px-2.5 py-1 text-xs font-medium tabular-nums text-cream-50"
          >
            {index + 1} / {items.length}
          </p>
        </>
      )}
    </div>
  );
}
