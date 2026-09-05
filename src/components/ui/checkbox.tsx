"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, className, ...props }, ref) {
    // An empty label (icon-only/table-cell usage, identified by aria-label
    // instead) would otherwise leave only the 20px box itself tappable —
    // padding the label expands the hit area without changing the visible
    // checkbox (a small negative margin absorbs the padding so it doesn't
    // visually crowd adjacent content in a tight flex row).
    const iconOnly = label === "";
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 text-sm text-ink",
          iconOnly && "-m-2 p-2",
          props.disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <span className="relative mt-0.5 inline-flex shrink-0">
          <input
            ref={ref}
            type="checkbox"
            className="peer size-5 cursor-pointer appearance-none rounded-md border border-navy-300 bg-surface transition-colors checked:border-navy-700 checked:bg-navy-700 disabled:cursor-not-allowed"
            {...props}
          />
          <Check
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto size-3.5 text-cream-50 opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        {!iconOnly && (
          <span>
            {label}
            {description && (
              <span className="mt-0.5 block text-xs text-muted">
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );
  },
);
