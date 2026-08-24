"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Group radios inside a fieldset with an accessible legend. */
export function RadioGroup({
  legend,
  className,
  children,
}: {
  legend: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn("space-y-2.5", className)}>
      <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-gold-700">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 text-sm text-ink",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          ref={ref}
          type="radio"
          className="peer size-5 cursor-pointer appearance-none rounded-full border border-navy-300 bg-surface transition-colors checked:border-navy-700 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-2.5 scale-0 rounded-full bg-navy-700 transition-transform peer-checked:scale-100"
        />
      </span>
      <span>
        {label}
        {description && (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        )}
      </span>
    </label>
  );
});
