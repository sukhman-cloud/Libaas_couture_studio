import "server-only";
import { z } from "zod";

/**
 * Validated server-side environment configuration.
 * The "server-only" import makes any client-side import a build error.
 */
/**
 * `.env` files load unset keys as "" (e.g. `SESSION_SECRET=`), which is not
 * `undefined` — treat empty strings as absent so `.optional()`/`.default()`
 * behave the way the setup instructions promise.
 */
const emptyAsUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SESSION_SECRET: z.preprocess(
    emptyAsUndefined,
    z.string().min(16).optional(),
  ),
  ADMIN_DEV_PASSWORD: z.preprocess(
    emptyAsUndefined,
    z.string().min(8).optional(),
  ),
  DATA_PROVIDER: z.preprocess(
    emptyAsUndefined,
    z.enum(["memory", "file"]).default("file"),
  ),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyAsUndefined,
    z.string().url().default("http://localhost:3000"),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message instead of undefined behaviour later.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
