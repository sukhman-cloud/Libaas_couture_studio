import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Table primitives. The wrapper scrolls horizontally on small screens so
 * wide tables never break the page layout.
 */

export function Table({
  className,
  wrapperClassName,
  ...props
}: HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-2xl border border-cream-200 bg-surface",
        wrapperClassName,
      )}
    >
      <table
        className={cn("w-full min-w-max caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-cream-200 bg-cream-100/60", className)}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-cream-200", className)} {...props} />;
}

export function TR({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-cream-100/50", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-ink", className)} {...props} />;
}

/**
 * Mobile card list that stands in for a `<Table>` below `sm`. Pair it with
 * a `<Table>` wrapped in `hidden sm:block` so dense admin lists render as
 * touch-friendly stacked cards on phones and a scannable table from `sm` up,
 * instead of forcing horizontal scroll on the smallest screens.
 */
export function RowCardList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-3 sm:hidden", className)} {...props} />;
}

export function RowCard({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        "rounded-2xl border border-cream-200 bg-surface p-4 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

/** Label/value row inside a `RowCard` — mirrors a table row's two cells. */
export function RowCardField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1 text-sm", className)}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}
