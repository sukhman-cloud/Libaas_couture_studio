"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Container, Section } from "@/components/ui/layout";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged server-side for us; the customer only sees the message below.
    console.error(error);
  }, [error]);

  return (
    <Container>
      <Section space="md">
        <ErrorState
          title="We couldn't load this piece"
          description="Something went wrong on our side. Please try again in a moment."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={reset}>Try again</Button>
              <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                Back to shop
              </Link>
            </div>
          }
        />
      </Section>
    </Container>
  );
}
