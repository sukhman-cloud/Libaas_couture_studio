import "server-only";
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { rename, writeFile } from "fs/promises";
import path from "path";
import {
  createStoreRepositories,
  emptyStore,
  migrateStore,
  STORE_VERSION,
  type DataStore,
} from "@/server/data/store-provider";
import type { Repositories } from "@/server/data/repositories";

/**
 * JSON-file data provider — development persistence without a database.
 * Data lives in .data/dev-store.json (git-ignored). Writes are atomic
 * (temp file + rename), serialized so concurrent mutations can't interleave
 * half-written files, and resilient to transient Windows rename failures.
 *
 * KNOWN LIMITS (fine for local dev, documented for later phases):
 * - single-process only (next start / next dev, not multi-instance)
 * - replaced by a real database + migrations in a future phase, behind
 *   the same repository interfaces.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "dev-store.json");

/**
 * Move an unreadable/incompatible store aside so the first write can't
 * destroy it. Returns false when the copy failed — callers that would
 * otherwise overwrite real data MUST refuse to continue.
 */
function backupUnreadable(reason: string): boolean {
  try {
    const backup = `${STORE_PATH}.${reason}-${Date.now()}.bak`;
    copyFileSync(STORE_PATH, backup);
    console.warn(`[data] Preserved the existing store at ${backup}.`);
    return true;
  } catch (error) {
    console.error("[data] Could not back up the existing store file.", error);
    return false;
  }
}

function loadStore(): DataStore {
  if (!existsSync(STORE_PATH)) return emptyStore();

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(STORE_PATH, "utf8"));
  } catch (error) {
    // Unreadable JSON: back up (best effort) and start fresh, since there is
    // nothing here the app can interpret.
    console.error(
      `[data] Could not read ${STORE_PATH} — starting empty.`,
      error,
    );
    backupUnreadable("corrupt");
    return emptyStore();
  }

  const migrated = migrateStore(raw);
  const version = (raw as { version?: number } | null)?.version;

  if (!migrated) {
    // The file holds real data this build cannot interpret (usually written
    // by a NEWER build). Refuse to run rather than persist an empty store
    // over it — starting empty here would destroy accounts and catalog.
    backupUnreadable("unsupported");
    throw new Error(
      `[data] ${STORE_PATH} was written by an incompatible store version (${String(
        version,
      )}); this build supports up to ${STORE_VERSION}. Refusing to start so the file is not overwritten — restore a compatible file or move it aside.`,
    );
  }

  if (version !== migrated.version) {
    // Back up before an upgrade so a bad migration is always recoverable —
    // and abort if that backup could not be written.
    if (!backupUnreadable(`v${String(version)}-upgrade`)) {
      throw new Error(
        `[data] Refusing to upgrade ${STORE_PATH}: the safety backup could not be written.`,
      );
    }
    console.warn(
      `[data] Upgraded store from version ${String(version)} to ${migrated.version}.`,
    );
  }

  return migrated;
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rename with a small bounded retry: on Windows, antivirus/indexers briefly
 * lock files and cause transient EPERM/EACCES/EBUSY on an otherwise-atomic
 * MoveFileEx. A few short retries turn that into a non-event.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const transient = new Set(["EPERM", "EACCES", "EBUSY"]);
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !transient.has(code)) throw error;
      await sleep(50 * (attempt + 1));
    }
  }
  throw lastError;
}

function createFileRepositories(): Repositories {
  mkdirSync(DATA_DIR, { recursive: true });
  const store = loadStore();

  // Serialize writes: each persist runs after the previous one SETTLES
  // (success or failure), so one failed write can't poison the chain and
  // stop all future persistence.
  let writeChain: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const run = writeChain.catch(() => {}).then(async () => {
      const tempPath = `${STORE_PATH}.tmp`;
      await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
      await renameWithRetry(tempPath, STORE_PATH);
    });
    // Keep the chain going even if this write rejects; callers still see
    // their own write's outcome via the returned promise.
    writeChain = run.catch(() => {});
    return run;
  }

  return createStoreRepositories(store, persist);
}

/**
 * Cached on globalThis so Next.js dev-mode module reloads reuse one store
 * (and one write chain) instead of racing several.
 */
const globalCache = globalThis as unknown as {
  __lcsFileRepositories?: Repositories;
};

export function getFileRepositories(): Repositories {
  globalCache.__lcsFileRepositories ??= createFileRepositories();
  return globalCache.__lcsFileRepositories;
}
