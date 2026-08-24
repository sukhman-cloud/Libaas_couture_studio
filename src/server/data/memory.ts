import "server-only";
import {
  createStoreRepositories,
  emptyStore,
} from "@/server/data/store-provider";
import type { Repositories } from "@/server/data/repositories";

/**
 * In-memory data provider — empty seed, nothing persists across restarts.
 * Useful for tests and throwaway runs; the "file" provider is the default
 * for local development.
 */
export const memoryRepositories: Repositories = createStoreRepositories(
  emptyStore(),
  async () => {
    /* no-op — memory only */
  },
);
