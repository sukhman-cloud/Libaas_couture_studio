"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import {
  controlBorder,
  controlClasses,
  FormField,
  useFormField,
} from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Mark invalid when used without the label/error props. */
  invalid?: boolean;
}

/** Bare input control — wires itself to a surrounding <FormField>. */
export const InputControl = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "label" | "hint" | "error">
>(function InputControl({ className, invalid, id, ...props }, ref) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <input
      ref={ref}
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={isInvalid || undefined}
      className={cn("h-11", controlClasses, controlBorder(isInvalid), className)}
      {...props}
    />
  );
});

/** Input with optional built-in label/hint/error (via FormField). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, ...props },
  ref,
) {
  if (label || hint || error) {
    return (
      <FormField
        label={label}
        hint={hint}
        error={error}
        required={required}
        fieldId={props.id}
      >
        <InputControl ref={ref} required={required} {...props} />
      </FormField>
    );
  }
  return <InputControl ref={ref} required={required} {...props} />;
});
