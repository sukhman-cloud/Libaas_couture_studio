import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { CatalogToolbar } from "@/components/catalog/catalog-toolbar";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  parseCatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/shop-params";
import {
  getPublishedCategoryBySlug,
  listPublishedProducts,
  publishedCategoryNames,
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
  const { page, sortValue, filters, active } = parseCatalogParams(search);

  const basePath = `/categories/${category.slug}`;
  const [result, categoryNames] = await Promise.all([
    listPublishedProducts({ ...filters, categoryId: category.id }, page),
    publishedCategoryNames(),
  ]);

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

        {result.total === 0 ? (
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
        ) : (
          <>
            <CatalogToolbar
              basePath={basePath}
              active={active}
              sortValue={sortValue}
              total={result.total}
              hasFilters={false}
            />
            <ProductGrid
              products={toProductCards(result.products, categoryNames)}
            />
            <Pagination
              className="mt-10 flex justify-center"
              page={result.page}
              pageCount={result.pageCount}
              basePath={basePath}
              params={active}
            />
          </>
        )}
      </Section>
    </Container>
  );
}
