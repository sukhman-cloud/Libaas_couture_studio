import type { Metadata } from "next";
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
  getPublishedCategoryBySlug,
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
  const category = await getPublishedCategoryBySlug(slug);
  if (!category) return { title: "Category" };

  return {
    title: category.name,
    // Description comes from the studio's own content — never invented here.
    description: category.description,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const category = await getPublishedCategoryBySlug(slug);
  // Archived/draft categories are indistinguishable from missing ones.
  if (!category) notFound();

  const search = await searchParams;
  const parsed = parseCatalogParams(search);
  const { filters } = await resolveCatalogFilters(parsed.filters);

  const basePath = `/categories/${category.slug}`;
  // The category itself is fixed by the route, so it is never a URL filter.
  const scoped = { ...filters, categoryId: category.id };

  const [result, categoryNames, categories, collections, facets] =
    await Promise.all([
      listPublishedProducts({ ...scoped, sort: parsed.sort }, parsed.page),
      publishedCategoryNames(),
      listPublishedCategories(),
      listPublishedCollections(),
      getCatalogFacets({ categoryId: category.id }),
    ]);

  const labels = Object.fromEntries(
    collections.map((collection) => [collection.slug, collection.name]),
  );

  return (
    <Container>
      <Section space="md">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { title: "Categories", href: "/categories" },
                { title: category.name },
              ]}
            />
          }
          title={category.name}
          description={category.description}
        />

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
          hideCategory
          emptyState={
            parsed.filterCount > 0 ? (
              <EmptyState
                icon={Store}
                title="No products match your selection"
                description="Try removing a filter to see everything in this category."
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
                title="Nothing in this category yet"
                description="Pieces will appear here as the studio publishes them."
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
