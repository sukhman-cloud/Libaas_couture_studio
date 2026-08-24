"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "ghost" | "outline" | "solid";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  ghost: "text-navy-700 hover:bg-navy-50 active:bg-navy-100",
  outline:
    "border border-navy-200 text-navy-700 hover:bg-navy-50 active:bg-navy-100",
  solid: "bg-navy-700 text-cream-50 hover:bg-navy-800 active:bg-navy-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "size-9",
  md: "size-11",
};

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — icon-only buttons must always have one. */
  label: string;
  variant?: Variant;
  size?: Size;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, variant = "ghost", size = "md", className, type = "button", children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
