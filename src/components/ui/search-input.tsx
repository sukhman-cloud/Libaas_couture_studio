import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SearchInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  /** Accessible name; required because search inputs rarely carry labels. */
  "aria-label": string;
}

/**
 * Search control. Server-safe — submit it inside a GET <form action="…">
 * for zero-JS search navigation.
 */
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <span className={cn("relative block", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        className="h-10 w-full rounded-full border border-navy-200 bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-gold-500 focus:ring-4 focus:ring-gold-500/15 focus:outline-none"
        {...props}
      />
    </span>
  );
}
