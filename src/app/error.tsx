"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for debugging; replace with real error reporting later.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-50 px-4">
      <ErrorState
        className="w-full max-w-lg border-none bg-transparent"
        title="Something went wrong"
        description="An unexpected error occurred. You can try again — if it keeps happening, please let the studio know."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
