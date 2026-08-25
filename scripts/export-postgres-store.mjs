#!/usr/bin/env node
/**
 * PostgreSQL → JSON store export (Phase 5D) — the ROLLBACK path.
 *
 *   DATABASE_URL=... node scripts/export-postgres-store.mjs <output-path>
 *
 * Writes a version-4 store file the JSON provider can serve directly, so
 * switching back from the database is always possible: export, point
 * DATA_DIR at a directory holding the exported file as dev-store.json, and
 * set DATA_PROVIDER=file.
 *
 * Refuses to overwrite an existing file — pick a fresh path on purpose.
 * The database is only read. Output goes exactly where you say; remember
 * the exported file contains password hashes and customer data, so treat
 * it like .data/dev-store.json. Never commit it: name it
 * `store-export-<date>.json` or `dev-store.json` (both git-ignored by
 * pattern at any depth), or write it outside the repository.
 */

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { reconstructStore } from "./lib/db-to-store.mjs";

const target = process.argv[2];
if (!target) {
  console.error(
    "\n  Usage: DATABASE_URL=... node scripts/export-postgres-store.mjs <output-path>\n",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("\n  ABORTED  DATABASE_URL is not set.\n");
  process.exit(1);
}
const outputPath = path.resolve(process.cwd(), target);
if (existsSync(outputPath)) {
  console.error(
    `\n  ABORTED  ${outputPath} already exists — this script never overwrites. Pick a new path.\n`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const store = await reconstructStore(prisma);
await prisma.$disconnect();

writeFileSync(outputPath, JSON.stringify(store, null, 2), {
  encoding: "utf8",
  flag: "wx", // fail rather than clobber a file created meanwhile
});

const counts = Object.fromEntries(
  Object.entries(store)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value.length]),
);
console.log(`\n  Exported store (version ${store.version}) to ${outputPath}`);
for (const [key, value] of Object.entries(counts)) {
  console.log(`    ${key.padEnd(24)} ${String(value).padStart(5)}`);
}
console.log(
  "\n  Contains password hashes and customer data — handle like .data/dev-store.json.\n",
);
