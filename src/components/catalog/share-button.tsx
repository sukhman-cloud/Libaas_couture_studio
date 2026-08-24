"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Share control: the native Web Share sheet where the browser supports it,
 * otherwise copy-to-clipboard. No third-party SDK. Always shares the
 * canonical product URL.
 */
export function ShareButton({
  title,
  /** Canonical path, e.g. /products/some-slug */
  path,
}: {
  title: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function share() {
    // Resolved in the browser so the URL always matches the live origin.
    const url = new URL(path, window.location.origin).toString();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // The user dismissing the sheet is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Anything else falls through to the clipboard path.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", tone: "success" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Could not copy the link",
        description: "You can copy it from the address bar instead.",
        tone: "danger",
      });
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={share}>
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Share2 className="size-4" aria-hidden />
      )}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
