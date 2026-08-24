import type { HTMLAttributes } from "react";
import type { Money } from "@/types/domain";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Typography primitives — consistent, readable text on every device.
 * Sizes use fluid steps (mobile-first) so nothing needs per-screen tuning.
 */

type HeadingLevel = 1 | 2 | 3 | 4;

const headingStyles: Record<HeadingLevel, string> = {
  1: "font-display text-3xl font-semibold text-navy-800 sm:text-4xl",
  2: "font-display text-2xl font-semibold text-navy-800 sm:text-3xl",
  3: "font-display text-xl font-semibold text-navy-800 sm:text-2xl",
  4: "font-display text-lg font-semibold text-navy-800",
};

export function Heading({
  level = 2,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: HeadingLevel }) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(headingStyles[level], className)} {...props} />;
}

const textTones = {
  default: "text-ink",
  muted: "text-muted",
  inverse: "text-cream-100/80",
} as const;

const textSizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

export function Text({
  tone = "default",
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: keyof typeof textTones;
  size?: keyof typeof textSizes;
}) {
  return (
    <p
      className={cn(textSizes[size], textTones[tone], className)}
      {...props}
    />
  );
}

/** Small supporting text (timestamps, meta info). */
export function Caption({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-xs text-muted", className)} {...props} />;
}

/** Uppercase micro-label used above values/controls. */
export function Label({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-xs font-medium uppercase tracking-widest text-gold-700",
        className,
      )}
      {...props}
    />
  );
}

const priceSizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "font-display text-2xl font-semibold",
} as const;

/**
 * Price display. Renders real `Money` data passed to it — it never
 * fabricates amounts.
 */
export function Price({
  money,
  size = "md",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  money: Money;
  size?: keyof typeof priceSizes;
}) {
  return (
    <span
      className={cn("tabular-nums text-navy-800", priceSizes[size], className)}
      {...props}
    >
      {formatPrice(money.amount, money.currency)}
    </span>
  );
}
