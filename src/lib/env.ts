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
    z.enum(["memory", "file", "postgres"]).default("file"),
  ),
  /**
   * PostgreSQL connection string — required only when DATA_PROVIDER is
   * "postgres" (enforced below). Never commit a real value; local
   * development keeps using the file provider and leaves this unset.
   */
  DATABASE_URL: z.preprocess(
    emptyAsUndefined,
    z.string().min(1).optional(),
  ),
  /**
   * Base directory for local data (JSON store + uploaded media). Relative
   * paths resolve against the working directory; defaults to `.data`.
   * Set this to run a server against an isolated store — the corruption
   * tests rely on it so they can never touch real customer data.
   */
  DATA_DIR: z.preprocess(
    emptyAsUndefined,
    z.string().min(1).optional(),
  ),
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyAsUndefined,
    z.string().url().default("http://localhost:3000"),
  ),
  /**
   * Instagram feed configuration (Phase 6B) — OPTIONAL, and deliberately
   * validated LENIENTLY here: these power a decorative section, so a typo
   * must only disable the section with a warning (the instagram service
   * does the strict checks), never stop the whole site from booting the
   * way the critical variables above rightly do. Token is server-side
   * only; never reaches the browser. See docs/phase-6b-instagram.md.
   */
  INSTAGRAM_ACCESS_TOKEN: z.preprocess(
    emptyAsUndefined,
    z.string().optional(),
  ),
  /** Instagram user id; defaults to "me" (the token's owner). */
  INSTAGRAM_USER_ID: z.preprocess(
    emptyAsUndefined,
    z.string().optional(),
  ),
  /** Graph API base override — exists ONLY for tests against a mock. */
  INSTAGRAM_GRAPH_API_BASE_URL: z.preprocess(
    emptyAsUndefined,
    z.string().optional(),
  ),
});

const guardedSchema = envSchema.superRefine((value, ctx) => {
  // Selecting the postgres provider without a connection string must fail
  // at boot with a readable message, not at first query with a Prisma one.
  if (value.DATA_PROVIDER === "postgres" && !value.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: 'DATA_PROVIDER="postgres" requires DATABASE_URL to be set.',
    });
  }
});

const parsed = guardedSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message instead of undefined behaviour later.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
