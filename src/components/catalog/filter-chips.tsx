import Link from "next/link";
import { X } from "lucide-react";
import { Caption } from "@/components/ui/typography";
import {
  AVAILABILITY_LABELS,
  catalogHref,
  FILTER_CHIP_LABELS,
  type AvailabilityValue,
} from "@/lib/catalog/shop-params";

/**
 * Removable chips for the active filters. Each chip is a link that drops
 * exactly one param (and resets to page 1), so the whole thing works
 * without JavaScript and stays shareable.
 */

const CHIP_ORDER = [
  "category",
  "collection",
  "minPrice",
  "maxPrice",
  "fabric",
  "colour",
  "occasion",
  "work",
  "availability",
  "stitching",
  "customization",
] as const;

function chipValue(key: string, value: string, labels: Record<string, string>) {
  if (key === "category" || key === "collection") return labels[value] ?? value;
  if (key === "availability") {
    return AVAILABILITY_LABELS[value as AvailabilityValue] ?? value;
  }
  if (key === "minPrice") return `₹${value}+`;
  if (key === "maxPrice") return `up to ₹${value}`;
  if (key === "stitching") {
    return value === "yes" ? "Available" : "Not available";
  }
  if (key === "customization") {
    return value === "yes" ? "Available" : "Not available";
  }
  return value;
}

export function FilterChips({
  basePath,
  active,
  /** slug → display name for category/collection chips. */
  labels = {},
}: {
  basePath: string;
  active: Record<string, string>;
  labels?: Record<string, string>;
}) {
  const chips = CHIP_ORDER.filter((key) => active[key]);
  if (chips.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Caption>Filtered by</Caption>
      <ul className="flex flex-wrap gap-2">
        {chips.map((key) => (
          <li key={key}>
            <Link
              href={catalogHref(basePath, active, { [key]: undefined })}
              className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-surface py-1 pl-3 pr-2 text-xs text-navy-700 transition-colors hover:border-navy-400 hover:bg-navy-50"
            >
              <span>
                <span className="text-muted">{FILTER_CHIP_LABELS[key]}:</span>{" "}
                {chipValue(key, active[key], labels)}
              </span>
              <X className="size-3.5" aria-hidden />
              <span className="sr-only">
                Remove {FILTER_CHIP_LABELS[key]} filter
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={catalogHref(basePath, active.q ? { q: active.q } : {})}
        className="text-xs text-gold-700 underline-offset-4 hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
