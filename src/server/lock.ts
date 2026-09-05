import "server-only";

/**
 * Keyed in-process async mutex. Serializes read-modify-write sequences that
 * span awaits (e.g. load profile → mutate → persist) so two concurrent
 * requests for the same key can't lose each other's writes.
 *
 * Scope: one Node process — matches the file data provider. The future
 * database layer will enforce this with transactions + unique constraints
 * instead; callers keep using withLock and the guarantee only strengthens.
 *
 * LOCK ORDER (the whole ordering rule, in one place):
 *
 *   domain lock (`customer:<id>`, `signup:<email>`, `catalog`)
 *     → store lock (`store:write`, taken by every repository write and by
 *       `repos.transaction`)
 *
 * Always outermost-first, never the reverse, and never two domain locks in
 * a nest. That is what keeps the ordering acyclic — see the deadlock rule on
 * `Repositories.transaction`.
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

/**
 * The ONE domain lock key for everything a customer account owns: profile
 * row, customer profile, addresses, measurements, cart, wishlist, credential
 * and account state.
 *
 * Deliberately a single key rather than one per entity. Operations that look
 * unrelated are not: a profile edit writes the same `users` row that a
 * deactivation writes, and a password change and a password reset write the
 * same credential. One key means those can never interleave, and it is why
 * this must be defined once here instead of being re-spelt as a template
 * literal in each action file (a single typo would silently un-serialize an
 * operation).
 *
 * The key is the USER id — the ownership anchor for every customer-owned
 * record — never a CustomerProfile id.
 */
export function customerLockKey(userId: string): string {
  return `customer:${userId}`;
}

/**
 * The domain lock for everything an admin/staff account owns: the User row,
 * AdminUser role assignment and credential. Mirrors customerLockKey's
 * reasoning exactly, kept as a distinct namespace so a customer id and an
 * admin id can never collide on the same lock key.
 */
export function adminLockKey(userId: string): string {
  return `admin:${userId}`;
}
