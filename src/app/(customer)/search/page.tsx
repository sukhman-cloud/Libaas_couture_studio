import type { Metadata } from "next";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Search"
          description="Find designer suits, collections and services."
        />

        {/* Zero-JS search: a plain GET form. */}
        <form action="/search" role="search" className="max-w-xl">
          <SearchInput
            name="q"
            defaultValue={query}
            placeholder="Search the studio…"
            aria-label="Search the studio"
            autoFocus={!query}
          />
        </form>

        <div className="mt-8">
          <EmptyState
            icon={Search}
            title={query ? `No results for “${query}”` : "Start typing to search"}
            description={
              query
                ? "Search will come online together with the product catalog in a later phase."
                : "Products and collections will be searchable once the catalog is live."
            }
          />
        </div>
      </Section>
    </Container>
  );
}
