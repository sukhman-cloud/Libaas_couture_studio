import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Cart" };

export default function CartPage() {
  return (
    <Container>
      <Section space="md">
        <PageHeader title="Cart" />
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Checkout, payments and order tracking arrive in a later phase."
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
