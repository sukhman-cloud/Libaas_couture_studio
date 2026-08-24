"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Product gallery: one large image, thumbnail navigation, a counter and a
 * lightbox built on the Phase 2 Modal (native <dialog>), so Escape, the
 * backdrop click, focus trapping and scroll locking all come from the
 * already-verified dialog implementation.
 *
 * Images arrive pre-sorted from the server (sortOrder, primary first).
 */

export interface GalleryImage {
  mediaId: string;
  alt: string;
}

export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-2xl bg-cream-100">
        <div
          className="flex h-full flex-col items-center justify-center gap-2 text-muted"
          aria-hidden
        >
          <ImageOff className="size-8" />
          <span className="text-sm">Photo coming soon</span>
        </div>
        <span className="sr-only">No photographs available yet</span>
      </div>
    );
  }

  const current = images[Math.min(index, images.length - 1)];
  const go = (delta: number) =>
    setIndex((prev) => (prev + delta + images.length) % images.length);
  const label = (item: GalleryImage) => item.alt || productName;

  return (
    <div>
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-2xl bg-cream-100">
        <Image
          src={`/api/media/${current.mediaId}`}
          alt={label(current)}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
          className="object-cover"
        />

        <div className="absolute right-3 top-3">
          <IconButton
            label="View larger image"
            variant="solid"
            size="sm"
            onClick={() => setLightboxOpen(true)}
          >
            <Expand className="size-4" aria-hidden />
          </IconButton>
        </div>

        {images.length > 1 && (
          <>
            <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
              <IconButton
                label="Previous image"
                variant="solid"
                onClick={() => go(-1)}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </IconButton>
              <IconButton
                label="Next image"
                variant="solid"
                onClick={() => go(1)}
              >
                <ChevronRight className="size-5" aria-hidden />
              </IconButton>
            </div>
            <p
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-navy-900/80 px-3 py-1 text-xs text-cream-50"
              aria-live="polite"
            >
              {index + 1} of {images.length}
            </p>
          </>
        )}
      </div>

      {images.length > 1 && (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {images.map((item, itemIndex) => (
            <li key={item.mediaId} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Show image ${itemIndex + 1} of ${images.length}`}
                aria-current={itemIndex === index ? "true" : undefined}
                className={cn(
                  // 64px+ target — comfortable to tap.
                  "relative size-18 overflow-hidden rounded-xl border-2 transition-colors",
                  itemIndex === index
                    ? "border-gold-500"
                    : "border-transparent hover:border-navy-200",
                )}
              >
                <Image
                  src={`/api/media/${item.mediaId}`}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title={productName}
        description={
          images.length > 1 ? `Image ${index + 1} of ${images.length}` : undefined
        }
        className="max-w-3xl"
        footer={
          images.length > 1 ? (
            <div className="flex w-full items-center justify-between">
              <IconButton
                label="Previous image"
                variant="outline"
                onClick={() => go(-1)}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </IconButton>
              <span className="text-sm text-muted" aria-live="polite">
                {index + 1} of {images.length}
              </span>
              <IconButton
                label="Next image"
                variant="outline"
                onClick={() => go(1)}
              >
                <ChevronRight className="size-5" aria-hidden />
              </IconButton>
            </div>
          ) : undefined
        }
      >
        <div className="relative aspect-3/4 max-h-[70vh] w-full">
          <Image
            src={`/api/media/${current.mediaId}`}
            alt={label(current)}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
          />
        </div>
      </Modal>
    </div>
  );
}
