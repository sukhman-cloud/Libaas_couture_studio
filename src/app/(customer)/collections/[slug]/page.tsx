import type { Metadata } from "next";
import Image from "next/image";
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
  getPublishedCollectionBySlug,
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
  const { page, sortValue, filters, active } = parseCatalogParams(search);

  const basePath = `/collections/${collection.slug}`;
  const [result, categoryNames] = await Promise.all([
    listPublishedProducts({ ...filters, collectionId: collection.id }, page),
    publishedCategoryNames(),
  ]);

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
          <div className="relative mb-8 aspect-16/9 w-full overflow-hidden rounded-2xl bg-cream-100 sm:aspect-21/9">
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

        {result.total === 0 ? (
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
