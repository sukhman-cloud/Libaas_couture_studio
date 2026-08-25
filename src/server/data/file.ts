import "server-only";
import { copyFileSync, readdirSync, readFileSync, existsSync } from "fs";
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
import { DATA_DIR, ensureDataDir, STORE_FILENAME, STORE_PATH } from "@/server/paths";

/**
 * JSON-file data provider — development persistence without a database.
 * Data lives in <DATA_DIR>/dev-store.json (git-ignored). Writes are atomic
 * (temp file + rename), serialized so concurrent mutations can't interleave
 * half-written files, and resilient to transient Windows rename failures.
 *
 * FAIL-CLOSED CONTRACT
 * The one thing this provider must never do is start with an empty store
 * while a file holding real data is still on disk — the first later write
 * would destroy it. So every path that cannot produce a trustworthy store
 * refuses to start instead:
 *
 *   file missing            -> empty store        (nothing to lose)
 *   file unreadable (I/O)   -> retry, then REFUSE (the bytes are probably fine)
 *   file unparseable        -> preserve, recover from the newest valid
 *                              backup if there is one, else REFUSE
 *   shape/version rejected  -> preserve and REFUSE
 *   backup could not be made -> REFUSE
 *
 * KNOWN LIMITS (fine for local dev, documented for later phases):
 * - single-process only (next start / next dev, not multi-instance)
 * - replaced by a real database + migrations in a future phase, behind
 *   the same repository interfaces.
 */

/**
 * Thrown when the store cannot be trusted. Distinct from an incidental I/O
 * error because it is deterministic: retrying cannot help, so it is cached
 * and rethrown rather than re-deriving it (and re-writing a backup) on
 * every request.
 */
export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

/** Filesystem errors that are worth retrying — usually a transient lock. */
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EBUSY", "EMFILE"]);

const isTransient = (error: unknown) =>
  TRANSIENT_CODES.has((error as NodeJS.ErrnoException)?.code ?? "");

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function sleepSync(ms: number): void {
  // Startup happens before any request is served, so a short synchronous
  // wait is acceptable here and keeps loadStore() simple.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Move an unreadable/incompatible store aside so the first write can't
 * destroy it. Returns false when the copy failed — callers that would
 * otherwise overwrite real data MUST refuse to continue.
 */
function backupUnreadable(reason: string): string | null {
  try {
    const backup = `${STORE_PATH}.${reason}-${Date.now()}.bak`;
    copyFileSync(STORE_PATH, backup);
    console.warn(`[data] Preserved the existing store at ${backup}.`);
    return backup;
  } catch (error) {
    console.error("[data] Could not back up the existing store file.", error);
    return null;
  }
}

/**
 * Read the store file, retrying transient locks. Windows antivirus and
 * indexers briefly hold files open; treating that as "corrupt" would be a
 * catastrophic misdiagnosis, because the bytes on disk are perfectly good.
 * A read that never succeeds throws — it never degrades to an empty store.
 */
function readStoreFile(): string {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return readFileSync(STORE_PATH, "utf8");
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) break;
      sleepSync(50 * (attempt + 1));
    }
  }
  throw new StoreUnavailableError(
    `[data] Could not read ${STORE_PATH} (${
      (lastError as NodeJS.ErrnoException)?.code ?? "unknown error"
    }). Refusing to start with an empty store while the file is still on disk — fix the file's permissions or move it aside deliberately.`,
  );
}

/**
 * Backup file names look like `dev-store.json.<reason>-<epochMs>.bak`. The
 * reason itself contains hyphens ("v2-upgrade"), so the timestamp must be
 * anchored on the trailing digit run rather than found by splitting.
 */
const BACKUP_PATTERN = new RegExp(
  `^${STORE_FILENAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\..+-(\\d+)\\.bak$`,
);

function listBackupsNewestFirst(): string[] {
  try {
    return readdirSync(DATA_DIR)
      .map((name) => {
        const match = BACKUP_PATTERN.exec(name);
        return match ? { name, stamp: Number(match[1]) } : null;
      })
      .filter((entry): entry is { name: string; stamp: number } => entry !== null)
      .sort((a, b) => b.stamp - a.stamp)
      .map((entry) => path.join(DATA_DIR, entry.name));
  } catch (error) {
    console.error("[data] Could not list backups.", error);
    return [];
  }
}

/**
 * The newest backup that parses and migrates cleanly, if any.
 * `exclude` skips the copy just taken of the corrupt file — it is the newest
 * entry by construction and can never be a valid recovery source.
 */
function recoverFromBackup(exclude?: string | null): { store: DataStore; from: string } | null {
  for (const candidate of listBackupsNewestFirst()) {
    if (exclude && path.resolve(candidate) === path.resolve(exclude)) continue;
    try {
      const migrated = migrateStore(JSON.parse(readFileSync(candidate, "utf8")));
      if (migrated) return { store: migrated, from: candidate };
      console.warn(`[data] Backup ${candidate} is not a usable store; trying older.`);
    } catch {
      console.warn(`[data] Backup ${candidate} is unreadable; trying older.`);
    }
  }
  return null;
}

interface LoadedStore {
  store: DataStore;
  /** The in-memory store differs from the file; flush it promptly. */
  needsFlush: boolean;
}

function loadStore(): LoadedStore {
  // A missing file is the only legitimate way to start empty.
  if (!existsSync(STORE_PATH)) return { store: emptyStore(), needsFlush: false };

  const text = readStoreFile();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (parseError) {
    // Genuinely unparseable. Preserve it before anything else, then try to
    // recover from the newest backup that still makes sense.
    console.error(`[data] ${STORE_PATH} is not valid JSON.`, parseError);
    const preserved = backupUnreadable("corrupt");
    if (!preserved) {
      throw new StoreUnavailableError(
        `[data] ${STORE_PATH} is corrupt and a copy of it could not be written. Refusing to start so nothing overwrites it — copy the file somewhere safe by hand, then restart.`,
      );
    }

    const recovered = recoverFromBackup(preserved);
    if (recovered) {
      console.warn(
        `[data] Recovered the store from ${recovered.from}. The corrupt file is preserved at ${preserved}.`,
      );
      return { store: recovered.store, needsFlush: true };
    }

    throw new StoreUnavailableError(
      `[data] ${STORE_PATH} is corrupt and no usable backup was found. The corrupt file is preserved at ${preserved}. Refusing to start with an empty store — restore a good file into place, then restart.`,
    );
  }

  const migrated = migrateStore(raw);
  const version = (raw as { version?: number } | null)?.version;

  if (!migrated) {
    // The file holds real data this build cannot interpret (usually written
    // by a NEWER build, or a malformed shape). Refuse rather than persist an
    // empty store over it.
    const preserved = backupUnreadable("unsupported");
    throw new StoreUnavailableError(
      `[data] ${STORE_PATH} was written by an incompatible store version (${String(
        version,
      )}); this build supports up to ${STORE_VERSION}.${
        preserved ? ` A copy is preserved at ${preserved}.` : ""
      } Refusing to start so the file is not overwritten — restore a compatible file or move it aside.`,
    );
  }

  if (version !== migrated.version) {
    // Back up before an upgrade so a bad migration is always recoverable —
    // and abort if that backup could not be written.
    if (!backupUnreadable(`v${String(version)}-upgrade`)) {
      throw new StoreUnavailableError(
        `[data] Refusing to upgrade ${STORE_PATH}: the safety backup could not be written.`,
      );
    }
    console.warn(
      `[data] Upgraded store from version ${String(version)} to ${migrated.version}.`,
    );
    // Flushed immediately below. Without that, the upgrade lives only in
    // memory, the file keeps its old version, and every restart takes
    // another identical backup — filling the directory over time.
    return { store: migrated, needsFlush: true };
  }

  return { store: migrated, needsFlush: false };
}

/**
 * Rename with a small bounded retry: on Windows, antivirus/indexers briefly
 * lock files and cause transient EPERM/EACCES/EBUSY on an otherwise-atomic
 * MoveFileEx. A few short retries turn that into a non-event.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) throw error;
      // No point sleeping after the final attempt.
      if (attempt < 4) await sleep(50 * (attempt + 1));
    }
  }
  throw lastError;
}

function createFileRepositories(): Repositories {
  ensureDataDir();
  const loaded = loadStore();
  const store = loaded.store;

  // Serialize writes: each persist runs after the previous one SETTLES
  // (success or failure), so one failed write can't poison the chain and
  // stop all future persistence.
  let writeChain: Promise<void> = Promise.resolve();

  // Process-unique temp name. A shared fixed name lets two servers pointed
  // at the same directory interleave their writes and promote a torn file.
  const tempPath = `${STORE_PATH}.${process.pid}.tmp`;

  function persist(): Promise<void> {
    const run = writeChain.catch(() => {}).then(async () => {
      await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
      await renameWithRetry(tempPath, STORE_PATH);
    });
    // Keep the chain going even if this write rejects; callers still see
    // their own write's outcome via the returned promise.
    writeChain = run.catch(() => {});
    return run;
  }

  if (loaded.needsFlush) {
    void persist().catch((error) => {
      console.error("[data] Could not write the upgraded/recovered store.", error);
    });
  }

  return createStoreRepositories(store, persist);
}

/**
 * Cached on globalThis so Next.js dev-mode module reloads reuse one store
 * (and one write chain) instead of racing several.
 *
 * A fail-closed refusal is cached too. It is deterministic, and re-deriving
 * it per request would write a fresh timestamped backup every time — page
 * prefetches alone could fill the disk.
 */
const globalCache = globalThis as unknown as {
  __lcsFileRepositories?: Repositories;
  __lcsFileStoreFailure?: StoreUnavailableError;
};

export function getFileRepositories(): Repositories {
  if (globalCache.__lcsFileStoreFailure) throw globalCache.__lcsFileStoreFailure;
  if (globalCache.__lcsFileRepositories) return globalCache.__lcsFileRepositories;

  try {
    globalCache.__lcsFileRepositories = createFileRepositories();
  } catch (error) {
    // Only the deliberate refusals stick. An incidental error (a transient
    // mkdir failure, say) should be retryable on the next request.
    if (error instanceof StoreUnavailableError) {
      console.error(error.message);
      globalCache.__lcsFileStoreFailure = error;
    }
    throw error;
  }
  return globalCache.__lcsFileRepositories;
}
