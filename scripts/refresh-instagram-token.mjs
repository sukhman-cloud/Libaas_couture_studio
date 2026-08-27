#!/usr/bin/env node
/**
 * Refresh the long-lived Instagram access token (Phase 6B).
 *
 *   node scripts/refresh-instagram-token.mjs
 *
 * Reads the CURRENT token from the environment or from `.env.local` —
 * so it never has to be typed on a command line (where it would land in
 * shell history). Long-lived Instagram-Login tokens last ~60 days and can
 * be refreshed any time after they are 24 hours old, via the official:
 *
 *   GET https://graph.instagram.com/refresh_access_token
 *       ?grant_type=ig_refresh_token&access_token=...
 *
 * Prints the NEW token so you can paste it into `.env.local` (and the
 * hosting provider's environment settings). Run it well before the 60
 * days are up — a monthly reminder is plenty. The new token is printed to
 * YOUR terminal only; never commit it, never paste it anywhere public.
 */

import { readFileSync } from "node:fs";

/** Environment first, then a minimal `.env.local` KEY=VALUE lookup. */
function readConfig(key) {
  if (process.env[key]) return process.env[key];
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      if (trimmed.slice(0, eq).trim() === key) {
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        return value || undefined;
      }
    }
  } catch {
    /* no .env.local — fall through */
  }
  return undefined;
}

const token = readConfig("INSTAGRAM_ACCESS_TOKEN");
if (!token) {
  console.error(
    "\n  ABORTED  INSTAGRAM_ACCESS_TOKEN is not set — put the CURRENT token in .env.local (or the environment) and run again.\n",
  );
  process.exit(1);
}

const base =
  readConfig("INSTAGRAM_GRAPH_API_BASE_URL") ?? "https://graph.instagram.com";
const url = new URL(`${base.replace(/\/$/, "")}/refresh_access_token`);
url.searchParams.set("grant_type", "ig_refresh_token");
url.searchParams.set("access_token", token);

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.access_token) {
    // Never echo the request URL (it contains the token).
    const code = body?.error?.code;
    console.error(
      `\n  FAILED  refresh returned ${response.status}${code ? ` (error code ${code})` : ""}.`,
    );
    if (code === 190) {
      console.error(
        "  The current token is invalid or fully expired. Generate a fresh long-lived",
        "token from the Meta app dashboard (see docs/phase-6b-instagram.md).\n",
      );
    }
    process.exit(1);
  }

  const days = Math.floor((body.expires_in ?? 0) / 86_400);
  console.log("\n  New long-lived token (valid ~" + days + " days):\n");
  console.log("  " + body.access_token + "\n");
  console.log(
    "  Update INSTAGRAM_ACCESS_TOKEN in .env.local (and your host's env settings),",
  );
  console.log("  then restart the server. Do not commit it anywhere.\n");
} catch (error) {
  console.error(
    `\n  FAILED  could not reach the API (${error instanceof Error ? error.name : "error"}).\n`,
  );
  process.exit(1);
}
