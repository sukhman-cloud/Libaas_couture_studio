"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

/** Accessible toggle — a real checkbox with switch semantics. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  function Switch({ label, description, className, ...props }, ref) {
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start justify-between gap-4 text-sm text-ink",
          props.disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <span>
          {label}
          {description && (
            <span className="mt-0.5 block text-xs text-muted">
              {description}
            </span>
          )}
        </span>
        <span className="relative inline-flex shrink-0">
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            className="peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-navy-200 transition-colors checked:bg-navy-700 disabled:cursor-not-allowed"
            {...props}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5"
          />
        </span>
      </label>
    );
  },
);
