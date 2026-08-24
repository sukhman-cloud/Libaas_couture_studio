import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives — the only place spacing/width decisions live.
 * Screens compose these instead of hand-rolling margins.
 */

type BoxProps = HTMLAttributes<HTMLElement> & { as?: ElementType };

/** Max-width page container with responsive gutters. */
export function Container({ as: Tag = "div", className, ...props }: BoxProps) {
  return <Tag className={cn("container-page", className)} {...props} />;
}

const sectionSpace = {
  sm: "py-6 sm:py-8",
  md: "py-10 sm:py-14",
  lg: "py-14 sm:py-20",
} as const;

/** Vertical page band with a consistent spacing scale. */
export function Section({
  as: Tag = "section",
  space = "md",
  className,
  ...props
}: BoxProps & { space?: keyof typeof sectionSpace }) {
  return <Tag className={cn(sectionSpace[space], className)} {...props} />;
}

const gapScale = {
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-10",
} as const;

type Gap = keyof typeof gapScale;

/** Vertical flex stack. */
export function Stack({
  as: Tag = "div",
  gap = "md",
  className,
  ...props
}: BoxProps & { gap?: Gap }) {
  return (
    <Tag className={cn("flex flex-col", gapScale[gap], className)} {...props} />
  );
}

/** Horizontal flex row (wraps by default). */
export function Row({
  as: Tag = "div",
  gap = "md",
  wrap = true,
  className,
  ...props
}: BoxProps & { gap?: Gap; wrap?: boolean }) {
  return (
    <Tag
      className={cn(
        "flex items-center",
        wrap && "flex-wrap",
        gapScale[gap],
        className,
      )}
      {...props}
    />
  );
}

const gridCols = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
} as const;

/** Responsive grid with sensible mobile-first breakpoints. */
export function Grid({
  as: Tag = "div",
  cols = 3,
  gap = "md",
  className,
  ...props
}: BoxProps & { cols?: keyof typeof gridCols; gap?: Gap }) {
  return (
    <Tag
      className={cn("grid", gridCols[cols], gapScale[gap], className)}
      {...props}
    />
  );
}
