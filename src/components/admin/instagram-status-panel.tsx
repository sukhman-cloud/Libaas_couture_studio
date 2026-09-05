"use client";

import { useActionState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Caption, Text } from "@/components/ui/typography";
import {
  refreshInstagramAction,
  type InstagramRefreshState,
} from "@/lib/social/actions";
import type { InstagramStatus } from "@/server/instagram/service";

const initialState: InstagramRefreshState = { ok: true };

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Admin-only Instagram connection panel — read-only status plus a manual
 * refresh trigger. Never touches the token; `getInstagramStatus()` already
 * strips it before this component ever sees the data.
 */
export function InstagramStatusPanel({ status }: { status: InstagramStatus }) {
  const [state, formAction, isPending] = useActionState(
    refreshInstagramAction,
    initialState,
  );
  const { toast } = useToast();
  const lastState = useRef<InstagramRefreshState | null>(null);

  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    if (state.message) toast({ title: state.message, tone: "success" });
    else if (state.error) toast({ title: state.error, tone: "danger" });
  }, [state, toast]);

  if (!status.configured) {
    return (
      <div className="space-y-3">
        <Alert tone="info" title="Instagram is not connected">
          Set <code className="rounded bg-navy-900/10 px-1 py-0.5 text-xs">INSTAGRAM_ACCESS_TOKEN</code>{" "}
          (and restart the server) to show live posts and reels on the
          homepage. See <code className="rounded bg-navy-900/10 px-1 py-0.5 text-xs">docs/phase-6b-instagram.md</code>{" "}
          for the one-time setup steps.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">Connected</Badge>
        {status.cache?.expired && <Badge tone="danger">Cache expired</Badge>}
        {status.cache && !status.cache.expired && status.cache.stale && (
          <Badge tone="gold">Refreshing…</Badge>
        )}
        {status.lastFetchFailed && <Badge tone="danger">Last refresh failed</Badge>}
        <Caption>Account: {status.user}</Caption>
      </div>

      {status.cache ? (
        <Text tone="muted" size="sm">
          {status.cache.postCount} post{status.cache.postCount === 1 ? "" : "s"} cached ·
          last fetched {dateTimeFormatter.format(new Date(status.cache.fetchedAt))}
        </Text>
      ) : (
        <Text tone="muted" size="sm">
          Connected, but no feed has been fetched yet — it loads on the next
          homepage visit, or you can fetch it now.
        </Text>
      )}

      {status.lastFetchFailed && (
        <Alert tone="warning">
          The last refresh attempt failed. This is usually an expired access
          token — run <code className="rounded bg-navy-900/10 px-1 py-0.5 text-xs">node scripts/refresh-instagram-token.mjs</code>{" "}
          and update <code className="rounded bg-navy-900/10 px-1 py-0.5 text-xs">INSTAGRAM_ACCESS_TOKEN</code>.
          The homepage keeps showing the last good feed in the meantime (or
          hides the section once it&apos;s more than 24 hours stale).
        </Alert>
      )}

      <form action={formAction}>
        <Button type="submit" variant="outline" size="sm" isLoading={isPending}>
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh now
        </Button>
      </form>
    </div>
  );
}
