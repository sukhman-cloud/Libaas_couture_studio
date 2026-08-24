"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Build an href for a page (client callers only — functions are not
   *  serializable, so server components use basePath/params instead). */
  hrefFor?: (page: number) => string;
  /** Server-friendly link building: base path + params to preserve. */
  basePath?: string;
  params?: Record<string, string>;
  /** Or handle changes client-side. */
  onPageChange?: (page: number) => void;
  className?: string;
}

/** Windowed page list: 1 … p-1 p p+1 … last. */
function pageWindow(page: number, pageCount: number): Array<number | "…"> {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) result.push("…");
    result.push(p);
    previous = p;
  }
  return result;
}

export function Pagination({
  page,
  pageCount,
  hrefFor,
  basePath,
  params,
  onPageChange,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const buildHref =
    hrefFor ??
    (basePath
      ? (target: number) => {
          const search = new URLSearchParams(params ?? {});
          if (target > 1) search.set("page", String(target));
          else search.delete("page");
          const query = search.toString();
          return query ? `${basePath}?${query}` : basePath;
        }
      : undefined);

  const itemClass = (active: boolean, disabled = false) =>
    cn(
      "inline-flex size-9 items-center justify-center rounded-full text-sm transition-colors",
      active
        ? "bg-navy-700 font-medium text-cream-50"
        : "text-navy-700 hover:bg-navy-50",
      disabled && "pointer-events-none opacity-40",
    );

  const renderTarget = (
    target: number,
    label: string,
    content: ReactNode,
    options?: { active?: boolean; disabled?: boolean },
  ) => {
    const { active = false, disabled = false } = options ?? {};
    if (buildHref && !disabled) {
      return (
        <Link
          href={buildHref(target)}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={itemClass(active)}
        >
          {content}
        </Link>
      );
    }
    return (
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        disabled={disabled}
        onClick={() => onPageChange?.(target)}
        className={itemClass(active, disabled)}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label="Pagination" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {renderTarget(page - 1, "Previous page", <ChevronLeft className="size-4" aria-hidden />, {
            disabled: page <= 1,
          })}
        </li>
        {pageWindow(page, pageCount).map((p, index) => (
          <li key={`${p}-${index}`}>
            {p === "…" ? (
              <span className="inline-flex size-9 items-center justify-center text-sm text-muted" aria-hidden>
                …
              </span>
            ) : (
              renderTarget(p, `Page ${p}`, p, { active: p === page })
            )}
          </li>
        ))}
        <li>
          {renderTarget(page + 1, "Next page", <ChevronRight className="size-4" aria-hidden />, {
            disabled: page >= pageCount,
          })}
        </li>
      </ul>
    </nav>
  );
}
