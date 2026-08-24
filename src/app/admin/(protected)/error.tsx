"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminError({
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
    <ErrorState
      title="This admin page failed to load"
      description="An unexpected error occurred. Try again — if it keeps happening, check the server logs."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
