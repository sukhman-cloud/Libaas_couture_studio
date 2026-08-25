import "server-only";
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * PrismaClient singleton for the PostgreSQL provider.
 *
 * Cached on globalThis so Next.js dev-mode module reloads reuse one client
 * (and one connection pool) instead of leaking connections — the same
 * pattern the file provider uses for its store.
 *
 * The client is created lazily, on first use, so running the app with
 * DATA_PROVIDER=file (the local default) never opens a database connection
 * and never requires DATABASE_URL to be set.
 */

const globalCache = globalThis as unknown as {
  __lcsPrismaClient?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (globalCache.__lcsPrismaClient) return globalCache.__lcsPrismaClient;

  if (!env.DATABASE_URL) {
    // env.ts already refuses to boot postgres mode without DATABASE_URL;
    // this guard exists for anyone importing the client directly.
    throw new Error(
      "DATABASE_URL is not set. The postgres data provider needs a PostgreSQL connection string.",
    );
  }

  globalCache.__lcsPrismaClient = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
  return globalCache.__lcsPrismaClient;
}
