import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import {
  catalogHref,
  parseCatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/shop-params";
import {
  getCatalogFacets,
  getPublishedCollectionBySlug,
  listPublishedCategories,
  listPublishedCollections,
  listPublishedProducts,
  publishedCategoryNames,
  resolveCatalogFilters,
  toProductCards,
} from "@/server/catalog/public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublishedCollectionBySlug(slug);
  if (!collection) return { title: "Collection" };

  return {
    title: collection.name,
    description: collection.description,
    alternates: { canonical: `/collections/${collection.slug}` },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const collection = await getPublishedCollectionBySlug(slug);
  // Archived/draft collections are indistinguishable from missing ones.
  if (!collection) notFound();

  const search = await searchParams;
  const parsed = parseCatalogParams(search);
  const { filters } = await resolveCatalogFilters(parsed.filters);

  const basePath = `/collections/${collection.slug}`;
  // The collection is fixed by the route, so it is never a URL filter.
  const scoped = { ...filters, collectionId: collection.id };

  const [result, categoryNames, categories, collections, facets] =
    await Promise.all([
      listPublishedProducts({ ...scoped, sort: parsed.sort }, parsed.page),
      publishedCategoryNames(),
      listPublishedCategories(),
      listPublishedCollections(),
      getCatalogFacets({ collectionId: collection.id }),
    ]);

  const labels = Object.fromEntries(
    categories.map((category) => [category.slug, category.name]),
  );

  return (
    <Container>
      <Section space="md">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { title: "Collections", href: "/collections" },
                { title: collection.name },
              ]}
            />
          }
          title={collection.name}
          description={collection.description}
        />

        {collection.coverMediaId && (
          <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-2xl bg-cream-100 sm:aspect-21/9">
            <Image
              src={`/api/media/${collection.coverMediaId}`}
              alt={collection.name}
              fill
              sizes="100vw"
              priority
              className="object-cover"
            />
          </div>
        )}

        <CatalogBrowser
          basePath={basePath}
          products={toProductCards(result.products, categoryNames)}
          total={result.total}
          page={result.page}
          pageCount={result.pageCount}
          active={parsed.active}
          sortValue={parsed.sortValue}
          filters={parsed.filters}
          filterCount={parsed.filterCount}
          facets={facets}
          categories={categories}
          collections={collections}
          labels={labels}
          hideCollection
          emptyState={
            parsed.filterCount > 0 ? (
              <EmptyState
                icon={Store}
                title="No products match your selection"
                description="Try removing a filter to see everything in this collection."
                action={
                  <Link
                    href={catalogHref(basePath, {})}
                    className={buttonStyles({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Store}
                title="Nothing in this collection yet"
                description="Pieces will appear here as the studio adds them."
                action={
                  <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                    Browse the shop
                  </Link>
                }
              />
            )
          }
        />
      </Section>
    </Container>
  );
}
