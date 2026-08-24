"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Container, Section } from "@/components/ui/layout";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged for us; customers only ever see the friendly message below.
    console.error(error);
  }, [error]);

  return (
    <Container>
      <Section space="md">
        <ErrorState
          title="We couldn't load the catalog"
          description="Something went wrong on our side. Please try again in a moment."
          action={<Button onClick={reset}>Try again</Button>}
        />
      </Section>
    </Container>
  );
}
