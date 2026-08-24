import type { Metadata } from "next";
import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Text } from "@/components/ui/typography";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const { categories } = getRepositories();
  const list = await categories.list();

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Collections"
          description="Curated categories and seasonal edits from the studio."
        />
        {list.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No collections yet"
            description="Collections will appear here once the studio publishes its catalog."
          />
        ) : (
          <Text tone="muted" size="sm">
            {list.length} collections exist — the browsing interface arrives in
            an upcoming phase.
          </Text>
        )}
      </Section>
    </Container>
  );
}
