"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import {
  controlBorder,
  controlClasses,
  useFormField,
} from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Styled native select — use inside <FormField> for label/error wiring. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, invalid, id, children, ...props }, ref) {
    const field = useFormField();
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
      <span className="relative block w-full">
        <select
          ref={ref}
          id={id ?? field?.id}
          aria-describedby={field?.describedBy}
          aria-invalid={isInvalid || undefined}
          className={cn(
            "h-11 appearance-none pr-10",
            controlClasses,
            controlBorder(isInvalid),
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
      </span>
    );
  },
);
