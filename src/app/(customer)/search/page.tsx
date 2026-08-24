import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import {
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
  title: "Search",
  description: "Search the Libaas Couture Studio catalog.",
  alternates: { canonical: "/search" },
  // Result pages are per-visitor navigation, not content to index.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const params = await searchParams;
  const parsed = parseCatalogParams(params);
  const query = parsed.filters.q ?? "";
  const { filters } = await resolveCatalogFilters(parsed.filters);

  const [result, categoryNames, categories, collections, facets] =
    await Promise.all([
      // An empty query lists nothing rather than the whole catalog — the
      // shop is the place to browse everything.
      query
        ? listPublishedProducts({ ...filters, sort: parsed.sort }, parsed.page)
        : Promise.resolve({ products: [], total: 0, page: 1, pageCount: 1 }),
      publishedCategoryNames(),
      listPublishedCategories(),
      listPublishedCollections(),
      getCatalogFacets(),
    ]);

  const labels = Object.fromEntries([
    ...categories.map((category) => [category.slug, category.name]),
    ...collections.map((collection) => [collection.slug, collection.name]),
  ]);

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Search"
          description={
            query
              ? `Results for “${query}”`
              : "Find designer suits, couture and custom pieces."
          }
        />

        {/* Zero-JS search: a plain GET form. */}
        <form action="/search" role="search" className="mb-8 flex max-w-xl gap-2">
          <SearchInput
            name="q"
            defaultValue={query}
            placeholder="Search the catalog…"
            aria-label="Search the catalog"
            maxLength={100}
          />
          <button type="submit" className={buttonStyles({ size: "sm" })}>
            Search
          </button>
          {query && (
            <Link
              href="/search"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              Clear
            </Link>
          )}
        </form>

        {query ? (
          <CatalogBrowser
            basePath="/search"
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
              <EmptyState
                icon={Search}
                title="No products found"
                description={`Nothing matched “${query}”. Try a different word, or browse the full catalog.`}
                action={
                  <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                    Browse the shop
                  </Link>
                }
              />
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Start typing to search"
            description="Search by name, fabric, occasion or anything in a product's description."
            action={
              <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                Browse the shop
              </Link>
            }
          />
        )}
      </Section>
    </Container>
  );
}
