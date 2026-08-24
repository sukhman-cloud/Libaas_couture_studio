import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import {
  countPublishedByGroup,
  listPublishedCategories,
} from "@/server/catalog/public";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse Libaas Couture Studio by category — the kind of piece you are looking for.",
  alternates: { canonical: "/categories" },
};

/**
 * The catalog is edited by the admin at runtime, so this page must never be
 * frozen as a build-time snapshot (which would show an empty catalog
 * forever). Rendered per request; the query itself is cheap.
 */
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listPublishedCategories();
  const counts = await countPublishedByGroup(
    "categoryId",
    categories.map((category) => category.id),
  );

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Categories"
          description="Browse by the kind of piece you are looking for."
        />

        {categories.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Categories will appear here once the studio publishes them."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-cream-200 bg-surface p-5 transition-colors hover:border-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
                >
                  <Heading level={3} className="wrap-break-word text-lg">
                    {category.name}
                  </Heading>
                  {category.description && (
                    <Text tone="muted" size="sm" className="mt-1 line-clamp-2">
                      {category.description}
                    </Text>
                  )}
                  <Caption className="mt-auto pt-3">
                    {counts[category.id] ?? 0}{" "}
                    {(counts[category.id] ?? 0) === 1 ? "piece" : "pieces"}
                  </Caption>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Container>
  );
}
