import "server-only";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { env } from "@/lib/env";

/**
 * Local filesystem layout — the single source of truth for every path the
 * server writes to.
 *
 * The JSON store and uploaded media used to derive their locations
 * independently from `process.cwd()`. That let them drift apart: pointing a
 * test run at a different store still wrote its uploads into the real
 * media directory. Both now hang off one base so isolating a run isolates
 * all of it.
 *
 * Resolved once at module load, like every other environment-derived value.
 * `DATA_DIR` may be absolute or relative to the working directory.
 *
 * These paths exist only for the local development providers. Production
 * replaces the store with a database and media with object storage.
 */

export const DATA_DIR = path.resolve(process.cwd(), env.DATA_DIR ?? ".data");

export const STORE_PATH = path.join(DATA_DIR, "dev-store.json");

export const STORE_FILENAME = path.basename(STORE_PATH);

export const MEDIA_DIR = path.join(DATA_DIR, "media");

/**
 * Create the data directory and make it self-ignoring.
 *
 * Whatever DATA_DIR points at holds scrypt password hashes, reset-token
 * hashes, phone numbers, addresses and measurements. `.gitignore` covers the
 * default `.data/`, but DATA_DIR exists precisely so a run can be pointed
 * somewhere else — and a directory like `.data-test/` inside the repo would
 * otherwise be perfectly committable. Dropping a `*` ignore file into the
 * directory itself makes that impossible wherever it lands.
 *
 * Every writer must call this before creating files under DATA_DIR.
 */
export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const guard = path.join(DATA_DIR, ".gitignore");
  if (!existsSync(guard)) {
    try {
      writeFileSync(guard, "# Local data — never commit.\n*\n");
    } catch {
      // A missing guard must never stop the app from serving; the
      // repository's own .gitignore rules still cover the default location.
    }
  }
}
