import "server-only";
import { getRepositories } from "@/server/data";
import type { StoreRepositories } from "@/server/data/repositories";
import { customerLockKey, withLock } from "@/server/lock";
import type { AuthCredential, ID, User } from "@/types/domain";

/**
 * The single entry point for security-sensitive account mutations —
 * password change, password reset, deactivation, profile identity edits.
 *
 * WHY THIS EXISTS
 *
 * Every one of those operations used to follow the same broken shape:
 *
 *     const user = await getCustomerUser();   // reads a User row
 *     ...await verifyPassword(...)            // ~100 ms of scrypt
 *     await repos.users.update({ ...user })   // writes the row read above
 *
 * The object read on line 1 is a SNAPSHOT. Anything that lands during the
 * gap is silently reverted by the spread on line 3 — which is exactly how a
 * profile save could resurrect `isActive: true` over a deactivation that
 * had already committed. Locking the write alone does not fix it: the stale
 * read happened before the lock was taken.
 *
 * `mutateAccount` closes that by construction:
 *
 *   1. take the customer's domain lock — no other account mutation for this
 *      user runs concurrently (see `customerLockKey`);
 *   2. open a store transaction — every write inside lands as one atomic
 *      commit, or none of them do;
 *   3. RE-READ the User and AuthCredential inside that transaction and hand
 *      those to the callback. They are the current rows, not a snapshot from
 *      before the lock;
 *   4. refuse up front when the account has since been deleted or
 *      deactivated, so no caller has to remember to check.
 *
 * RULES FOR CALLBACKS
 *
 * - Write through `ctx.tx`, NEVER through `getRepositories()`. The
 *   transaction already holds the store lock; re-entering it deadlocks.
 * - Derive writes from `ctx.user` / `ctx.credential`, never from a User
 *   captured outside. That is the whole point.
 * - Do not call `redirect()` (or anything else that throws to control flow)
 *   inside the callback — a throw rolls the transaction back. Return a value
 *   and redirect after `mutateAccount` returns.
 * - Do not take another lock inside. Domain locks are outermost, always.
 *
 * WHAT THIS DOES NOT GIVE YOU
 *
 * The lock is a Map in one Node process and the transaction is a snapshot
 * plus one atomic file replace. Together they are correct for the single
 * long-lived server this project runs today, and they are NOT multi-process
 * isolation: a second process pointed at the same JSON file would not see
 * this lock at all. PostgreSQL supplies the real thing later — callers keep
 * this exact shape and the guarantee only strengthens.
 */

export interface AccountMutationContext {
  /** Transaction-scoped repositories. The ONLY way to write in here. */
  tx: StoreRepositories;
  /** The User row as it exists right now, re-read inside the transaction. */
  user: User;
  /** The credential row as it exists right now. */
  credential: AuthCredential;
}

export type AccountMutationFailure =
  /** No such customer, or the credential row is gone. */
  | "not_found"
  /** The account was deactivated — possibly by a concurrent request. */
  | "inactive";

export type AccountMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AccountMutationFailure };

export interface AccountMutationOptions {
  /**
   * Refuse when the account is not active. Defaults to true, and only
   * deactivation itself has a reason to turn it off (it must stay
   * idempotent for a repeat submit).
   */
  requireActive?: boolean;
}

export async function mutateAccount<T>(
  userId: ID,
  mutate: (ctx: AccountMutationContext) => Promise<T>,
  options: AccountMutationOptions = {},
): Promise<AccountMutationResult<T>> {
  const requireActive = options.requireActive ?? true;

  return withLock(customerLockKey(userId), () =>
    getRepositories().transaction(
      async (tx): Promise<AccountMutationResult<T>> => {
        // The re-read. Inside the transaction nothing else can write, so
        // these rows cannot go stale before the callback finishes.
        const user = await tx.users.getById(userId);
        if (!user || user.kind !== "customer") {
          return { ok: false, reason: "not_found" };
        }
        if (requireActive && !user.isActive) {
          return { ok: false, reason: "inactive" };
        }

        const credential = await tx.credentials.getByUserId(userId);
        if (!credential) return { ok: false, reason: "not_found" };

        return { ok: true, value: await mutate({ tx, user, credential }) };
      },
    ),
  );
}

/**
 * Advance the account's session version by exactly one, invalidating every
 * session minted before this call, and optionally rotate the password hash
 * in the same write. Returns the new version so the caller can re-mint the
 * cookie for the device that made the request.
 *
 * The +1 is computed from the credential THIS transaction read, so two
 * rotations that overlap produce +1 each — never a lost bump, and never a
 * write that hands back a version an earlier session was minted with.
 */
export async function rotateSession(
  ctx: AccountMutationContext,
  patch: Partial<Pick<AuthCredential, "passwordHash">> = {},
): Promise<number> {
  const updated = await ctx.tx.credentials.update({
    ...ctx.credential,
    ...patch,
    sessionVersion: ctx.credential.sessionVersion + 1,
    updatedAt: new Date().toISOString(),
  });
  return updated.sessionVersion;
}
