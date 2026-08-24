import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { CatalogToolbar } from "@/components/catalog/catalog-toolbar";
import { ProductGrid } from "@/components/catalog/product-grid";
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
  listPublishedProducts,
  publishedCategoryNames,
  toProductCards,
} from "@/server/catalog/public";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse designer suits, couture and custom pieces from Libaas Couture Studio.",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const params = await searchParams;
  const { page, sortValue, filters, active, hasFilters } =
    parseCatalogParams(params);

  const [result, categoryNames] = await Promise.all([
    listPublishedProducts(filters, page),
    publishedCategoryNames(),
  ]);

  const products = toProductCards(result.products, categoryNames);

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Shop"
          description="Every piece is made to measure in our Mohali studio."
        />

        {result.total === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Store}
              title="No products match your selection"
              description="Try a different selection, or browse the full catalog."
              action={
                <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                  Reset selection
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Store}
              title="No products available yet"
              description="Our catalog is being prepared. In the meantime, visit the studio or message us to start a custom piece."
              action={
                <Link href="/collections" className={buttonStyles({ variant: "outline" })}>
                  Browse collections
                </Link>
              }
            />
          )
        ) : (
          <>
            <CatalogToolbar
              basePath="/shop"
              active={active}
              sortValue={sortValue}
              total={result.total}
              hasFilters={hasFilters}
            />
            <ProductGrid products={products} />
            <Pagination
              className="mt-10 flex justify-center"
              page={result.page}
              pageCount={result.pageCount}
              basePath="/shop"
              params={active}
            />
          </>
        )}
      </Section>
    </Container>
  );
}
