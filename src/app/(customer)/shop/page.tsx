import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
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
  listPublishedCategories,
  listPublishedCollections,
  listPublishedProducts,
  publishedCategoryNames,
  resolveCatalogFilters,
  toProductCards,
} from "@/server/catalog/public";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse designer suits, couture and custom pieces from Libaas Couture Studio.",
  // One canonical for every filter combination — filtered views are
  // navigation, not separate pages to index.
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const params = await searchParams;
  const parsed = parseCatalogParams(params);
  const { filters } = await resolveCatalogFilters(parsed.filters);

  const [result, categoryNames, categories, collections, facets] =
    await Promise.all([
      listPublishedProducts({ ...filters, sort: parsed.sort }, parsed.page),
      publishedCategoryNames(),
      listPublishedCategories(),
      listPublishedCollections(),
      getCatalogFacets(),
    ]);

  const labels = Object.fromEntries([
    ...categories.map((category) => [category.slug, category.name]),
    ...collections.map((collection) => [collection.slug, collection.name]),
  ]);

  const anyFilterActive = parsed.filterCount > 0 || Boolean(parsed.filters.q);

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Shop"
          description="Every piece is made to measure in our Mohali studio."
        />

        <CatalogBrowser
          basePath="/shop"
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
          emptyState={
            anyFilterActive ? (
              <EmptyState
                icon={Store}
                title="No products match your selection"
                description="Try removing a filter, or browse the full catalog."
                action={
                  <Link
                    href={catalogHref("/shop", {})}
                    className={buttonStyles({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Store}
                title="No products available yet"
                description="Our catalog is being prepared. In the meantime, visit the studio or message us to start a custom piece."
                action={
                  <Link
                    href="/collections"
                    className={buttonStyles({ variant: "outline" })}
                  >
                    Browse collections
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
