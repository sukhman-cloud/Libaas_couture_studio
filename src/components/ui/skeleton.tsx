import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Loading placeholder block. Size it with className (h-*, w-*). */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-navy-100/70", className)}
      {...props}
    />
  );
}
