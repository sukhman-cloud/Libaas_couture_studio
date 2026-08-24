import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return (
    <Container>
      <Section space="md">
        <PageHeader title="Wishlist" />
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Pieces you love will live here once the catalog opens."
          action={
            <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
              Browse the shop
            </Link>
          }
        />
      </Section>
    </Container>
  );
}
