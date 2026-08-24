import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Search } from "lucide-react";
import { CollectionsManager } from "@/components/admin/collections-manager";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Admin · Collections" };

export default async function AdminCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminSession();

  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const repos = getRepositories();
  // The query includes archived rows so archiving everything never hides
  // the list behind the empty state.
  const [result, productPage] = await Promise.all([
    repos.collections.query({ search: search || undefined, limit: 200 }),
    // Recent products for quick assignment — bounded for performance.
    repos.products.query({ excludeArchived: true, sort: "updated_desc", limit: 50 }),
  ]);

  const assignableProducts = productPage.rows.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    collectionIds: product.collectionIds,
  }));

  // Real membership counts come from the repository, not from the
  // truncated assignment page.
  const productCounts = Object.fromEntries(
    await Promise.all(
      result.rows.map(async (collection) => {
        const page = await repos.products.query({
          collectionId: collection.id,
          excludeArchived: true,
          limit: 0,
        });
        return [collection.id, page.total] as const;
      }),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Collections"
        description="How the studio groups products — seasonal or thematic edits."
      />

      {result.total === 0 && !search ? (
        <div className="space-y-5">
          <EmptyState
            icon={LayoutGrid}
            title="No collections yet"
            description="Collections group products across categories — for example a seasonal edit. Create one and assign products to it."
          />
          <CollectionsManager
            collections={[]}
            products={assignableProducts}
            productCounts={{}}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <form
            method="get"
            action="/admin/collections"
            role="search"
            className="flex max-w-md gap-2"
          >
            <SearchInput
              name="q"
              defaultValue={search}
              placeholder="Search collections…"
              aria-label="Search collections"
            />
            <button type="submit" className={buttonStyles({ size: "sm" })}>
              <Search className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Search</span>
            </button>
            {search && (
              <Link
                href="/admin/collections"
                className={buttonStyles({ variant: "ghost", size: "sm" })}
              >
                Clear
              </Link>
            )}
          </form>

          <CollectionsManager
            collections={result.rows}
            products={assignableProducts}
            productCounts={productCounts}
          />
        </div>
      )}
    </div>
  );
}
