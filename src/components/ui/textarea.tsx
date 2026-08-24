"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import {
  controlBorder,
  controlClasses,
  useFormField,
} from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Styled textarea — use inside <FormField> for label/error wiring. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, id, rows = 4, ...props }, ref) {
    const field = useFormField();
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
      <textarea
        ref={ref}
        id={id ?? field?.id}
        rows={rows}
        aria-describedby={field?.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          "min-h-20 resize-y py-2.5",
          controlClasses,
          controlBorder(isInvalid),
          className,
        )}
        {...props}
      />
    );
  },
);
