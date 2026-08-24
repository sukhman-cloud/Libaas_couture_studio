import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import {
  countPublishedByGroup,
  listPublishedCollections,
} from "@/server/catalog/public";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Seasonal and thematic edits curated by Libaas Couture Studio.",
  alternates: { canonical: "/collections" },
};

/**
 * Runtime-edited catalog data — never a build-time snapshot.
 * See the note in app/(customer)/categories/page.tsx.
 */
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await listPublishedCollections();
  const counts = await countPublishedByGroup(
    "collectionId",
    collections.map((collection) => collection.id),
  );

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Collections"
          description="Edits curated by the studio — seasonal and thematic groupings."
        />

        {collections.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No collections yet"
            description="Collections will appear here once the studio publishes them."
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="group flex h-full flex-col rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
                >
                  <div className="relative aspect-16/10 w-full overflow-hidden rounded-2xl bg-cream-100">
                    {collection.coverMediaId ? (
                      <Image
                        src={`/api/media/${collection.coverMediaId}`}
                        alt={collection.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span
                        className="flex h-full items-center justify-center font-display text-2xl italic text-muted"
                        aria-hidden
                      >
                        {collection.name}
                      </span>
                    )}
                  </div>
                  <Heading level={3} className="wrap-break-word mt-3 text-xl">
                    {collection.name}
                  </Heading>
                  {collection.description && (
                    <Text tone="muted" size="sm" className="mt-1 line-clamp-2">
                      {collection.description}
                    </Text>
                  )}
                  <Caption className="mt-1">
                    {counts[collection.id] ?? 0}{" "}
                    {(counts[collection.id] ?? 0) === 1 ? "piece" : "pieces"}
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
