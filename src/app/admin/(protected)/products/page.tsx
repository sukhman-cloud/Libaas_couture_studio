import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus, Search } from "lucide-react";
import { ProductList, type ProductRow } from "@/components/admin/product-list";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Caption } from "@/components/ui/typography";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import type {
  CatalogStatus,
  ProductAvailability,
} from "@/types/domain";
import type { ProductSort } from "@/server/data/repositories";

export const metadata: Metadata = { title: "Admin · Products" };

const PAGE_SIZE = 20;

const statusOptions: Array<{ value: CatalogStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const availabilityOptions: Array<{
  value: ProductAvailability | "";
  label: string;
}> = [
  { value: "", label: "All availability" },
  { value: "available", label: "Available" },
  { value: "made_to_order", label: "Made to order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "discontinued", label: "Discontinued" },
];

const sortOptions: Array<{ value: ProductSort; label: string }> = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "created_desc", label: "Newest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price low → high" },
  { value: "price_desc", label: "Price high → low" },
];

function asString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();

  const params = await searchParams;
  const search = asString(params.q);
  const status = asString(params.status) as CatalogStatus | "";
  const availability = asString(params.availability) as ProductAvailability | "";
  const categoryId = asString(params.category);
  const collectionId = asString(params.collection);
  const sort = (asString(params.sort) || "updated_desc") as ProductSort;
  const page = Math.max(1, Number(asString(params.page)) || 1);

  const repos = getRepositories();
  const [result, categoryPage, collectionPage, statusCounts] = await Promise.all([
    repos.products.query({
      search: search || undefined,
      status: status || undefined,
      availability: availability || undefined,
      categoryId: categoryId || undefined,
      collectionId: collectionId || undefined,
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    repos.categories.query({ excludeArchived: true, limit: 200 }),
    repos.collections.query({ excludeArchived: true, limit: 200 }),
    repos.products.countByStatus(),
  ]);

  const categoryNames = new Map(
    categoryPage.rows.map((category) => [category.id, category.name]),
  );

  const rows: ProductRow[] = result.rows.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: product.price,
    salePrice: product.salePrice,
    status: product.status,
    availability: product.availability,
    categoryName: product.categoryId
      ? categoryNames.get(product.categoryId)
      : undefined,
    updatedAt: product.updatedAt,
  }));

  const totalProducts =
    statusCounts.draft + statusCounts.published + statusCounts.archived;
  const hasFilters = Boolean(
    search || status || availability || categoryId || collectionId,
  );
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  // Preserved when paginating.
  const activeQuery: Record<string, string> = {};
  if (search) activeQuery.q = search;
  if (status) activeQuery.status = status;
  if (availability) activeQuery.availability = availability;
  if (categoryId) activeQuery.category = categoryId;
  if (collectionId) activeQuery.collection = collectionId;
  if (sort !== "updated_desc") activeQuery.sort = sort;

  return (
    <div>
      <PageHeader
        title="Products"
        description={
          totalProducts > 0
            ? `${statusCounts.published} published · ${statusCounts.draft} draft · ${statusCounts.archived} archived`
            : "Create the catalog the customer shop will use."
        }
        actions={
          <Link href="/admin/products/new" className={buttonStyles({ size: "sm" })}>
            <Plus className="size-4" aria-hidden />
            Add product
          </Link>
        }
      />

      {totalProducts === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product to start building the catalog. Nothing is published to customers until you set a product to Published."
          action={
            <Link href="/admin/products/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden />
              Add product
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Zero-JS filtering: a plain GET form, so filters are shareable. */}
          <form
            method="get"
            action="/admin/products"
            className="grid gap-3 rounded-2xl border border-cream-200 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
          >
            <div className="sm:col-span-2 lg:col-span-2">
              <SearchInput
                name="q"
                defaultValue={search}
                placeholder="Search name, SKU or tag…"
                aria-label="Search products"
              />
            </div>
            <FormField label="Status">
              <Select name="status" defaultValue={status}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Availability">
              <Select name="availability" defaultValue={availability}>
                {availabilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Category">
              <Select name="category" defaultValue={categoryId}>
                <option value="">All categories</option>
                {categoryPage.rows.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Collection">
              <Select name="collection" defaultValue={collectionId}>
                <option value="">All collections</option>
                {collectionPage.rows.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sort by">
              <Select name="sort" defaultValue={sort}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <button type="submit" className={buttonStyles({ size: "sm" })}>
                <Search className="size-4" aria-hidden />
                Apply
              </button>
              {hasFilters && (
                <Link
                  href="/admin/products"
                  className={buttonStyles({ variant: "ghost", size: "sm" })}
                >
                  Clear filters
                </Link>
              )}
            </div>
          </form>

          {result.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No products match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Link
                  href="/admin/products"
                  className={buttonStyles({ variant: "outline" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <>
              <Caption>
                {result.total} product{result.total === 1 ? "" : "s"} found
              </Caption>
              {/* Keyed by the rendered page + filters so bulk selection can
                  never carry over to products the admin can no longer see. */}
              <ProductList
                key={`${page}|${new URLSearchParams(activeQuery).toString()}`}
                products={rows}
                page={page}
                pageCount={pageCount}
                query={activeQuery}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
