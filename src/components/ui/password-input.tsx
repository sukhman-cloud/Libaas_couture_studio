"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  controlBorder,
  controlClasses,
  FormField,
  useFormField,
} from "@/components/ui/form-field";
import type { InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle — every password field in the
 * app should use this instead of a bare `type="password"` Input, so a
 * mistyped password (especially on a mobile keyboard) can be checked
 * before submitting.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput(
    { label, hint, error, required, invalid, className, id, ...props },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    const field = useFormField();
    const isInvalid = invalid ?? (error ? true : undefined) ?? field?.invalid ?? false;
    const fieldId = id ?? field?.id;

    const control = (
      <span className="relative block">
        <input
          ref={ref}
          id={fieldId}
          type={visible ? "text" : "password"}
          required={required}
          aria-describedby={field?.describedBy}
          aria-invalid={isInvalid || undefined}
          className={cn("h-11 pr-11", controlClasses, controlBorder(isInvalid), className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </span>
    );

    if (label || hint || error) {
      return (
        <FormField label={label} hint={hint} error={error} required={required} fieldId={fieldId}>
          {control}
        </FormField>
      );
    }
    return control;
  },
);
