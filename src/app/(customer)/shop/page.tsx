import type { Metadata } from "next";
import { Store } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Text } from "@/components/ui/typography";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Shop" };

export default async function ShopPage() {
  const { products } = getRepositories();
  const count = await products.countActive();

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Shop"
          description="Designer suits, collections and custom couture."
        />
        {count === 0 ? (
          <EmptyState
            icon={Store}
            title="The catalog is being tailored"
            description="Products arrive in a later phase, once the catalog and inventory are set up by the studio."
          />
        ) : (
          <Text tone="muted" size="sm">
            {count} products are in the catalog — the shop interface for
            browsing them arrives in an upcoming phase.
          </Text>
        )}
      </Section>
    </Container>
  );
}
