import { z } from "zod";
import {
  allMeasurementFields,
  fieldBounds,
} from "@/config/measurements";

/**
 * Customer-facing validation schemas — shared by server actions (the
 * authority) and reusable for client-side hints.
 */

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Enter a valid email address.");

/** Simple, usable password rule: length over complexity theatre. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.");

/** Indian mobile numbers: 10 digits (optionally +91 prefixed). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+91)?[6-9]\d{9}$/,
        "Enter a valid 10-digit mobile number.",
      ),
  );

export const signupSchema = z
  .object({
    name: trimmed(80, "Name"),
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  name: trimmed(80, "Name"),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
});

export const addressSchema = z.object({
  label: z.enum(["home", "work", "other"]),
  fullName: trimmed(80, "Full name"),
  phone: phoneSchema,
  line1: trimmed(120, "Address line 1"),
  line2: z.string().trim().max(120, "Address line 2 is too long.").optional(),
  locality: z.string().trim().max(80, "Locality is too long.").optional(),
  city: trimmed(60, "City"),
  state: trimmed(60, "State"),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  country: z.string().trim().max(60).default("India"),
});

/** Measurement values arrive as strings from form inputs. */
export const measurementProfileSchema = z.object({
  label: trimmed(40, "Profile name"),
  unit: z.enum(["cm", "in"]),
  fitPreference: z
    .enum(["fitted", "regular", "relaxed"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500, "Notes are too long.").optional(),
});

/**
 * Parse measurement fields from a FormData-like record: empty = omitted,
 * otherwise numeric within the field's sane bounds for the chosen unit.
 */
export function parseMeasurementValues(
  form: FormData,
  unit: "cm" | "in",
): { values: Array<{ key: string; value: number }>; errors: Record<string, string> } {
  const values: Array<{ key: string; value: number }> = [];
  const errors: Record<string, string> = {};

  for (const field of allMeasurementFields) {
    const raw = form.get(`m_${field.key}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const parsed = Number(raw.trim());
    const { min, max } = fieldBounds(field, unit);
    if (!Number.isFinite(parsed)) {
      errors[field.key] = "Enter a number.";
    } else if (parsed < min || parsed > max) {
      errors[field.key] = `Must be between ${min} and ${max} ${unit}.`;
    } else {
      values.push({ key: field.key, value: Math.round(parsed * 10) / 10 });
    }
  }

  return { values, errors };
}
