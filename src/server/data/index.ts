import "server-only";
import { env } from "@/lib/env";
import type { Repositories } from "@/server/data/repositories";
import { memoryRepositories } from "@/server/data/memory";
import { getFileRepositories } from "@/server/data/file";

/**
 * Data-provider factory. Server code asks for repositories here and never
 * touches a concrete store directly, so adding a database later is a
 * one-file change.
 */
export function getRepositories(): Repositories {
  switch (env.DATA_PROVIDER) {
    case "memory":
      return memoryRepositories;
    case "file":
      return getFileRepositories();
    default: {
      const exhaustive: never = env.DATA_PROVIDER;
      throw new Error(`Unknown DATA_PROVIDER: ${exhaustive as string}`);
    }
  }
}
