import "server-only";

/**
 * Keyed in-process async mutex. Serializes read-modify-write sequences that
 * span awaits (e.g. load profile → mutate → persist) so two concurrent
 * requests for the same key can't lose each other's writes.
 *
 * Scope: one Node process — matches the file data provider. The future
 * database layer will enforce this with transactions + unique constraints
 * instead; callers keep using withLock and the guarantee only strengthens.
 */

const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  // Keep the chain alive regardless of this task's outcome; drop the entry
  // once it settles and nothing newer has queued behind it.
  const settled = run.then(
    () => {},
    () => {},
  );
  chains.set(key, settled);
  settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
