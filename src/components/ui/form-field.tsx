"use client";

import {
  createContext,
  useContext,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * FormField — the single label/hint/error wrapper shared by every form
 * control. Controls read the context for their id / aria wiring, so the
 * pattern is never duplicated per component.
 */

interface FormFieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export function useFormField() {
  return useContext(FormFieldContext);
}

/** Base classes shared by input-like controls. */
export const controlClasses =
  "w-full rounded-xl border bg-surface px-4 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-gold-500 focus:ring-4 focus:ring-gold-500/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function controlBorder(invalid: boolean | undefined) {
  return invalid ? "border-danger" : "border-navy-200";
}

export interface FormFieldProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** id for the control; generated when omitted. */
  fieldId?: string;
  children: ReactNode;
}

export function FormField({
  label,
  hint,
  error,
  required,
  fieldId,
  className,
  children,
  ...props
}: FormFieldProps) {
  const autoId = useId();
  const id = fieldId ?? autoId;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("w-full", className)} {...props}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-gold-700"
        >
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <FormFieldContext.Provider
        value={{ id, describedBy, invalid: Boolean(error) }}
      >
        {children}
      </FormFieldContext.Provider>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
