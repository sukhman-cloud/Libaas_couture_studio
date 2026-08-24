import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * CSS-only tooltip: appears on hover AND keyboard focus, associated to the
 * child via aria-describedby. The child must be a single focusable element.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": id,
      })
    : children;

  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {child}
      {/* `hidden` (not opacity) keeps the idle bubble out of layout so it
          can never widen the page; width is capped for edge-adjacent use. */}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-lg bg-navy-900 px-2.5 py-1.5 text-center text-xs text-cream-50 shadow-md",
          "group-hover/tip:block group-focus-within/tip:block",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
