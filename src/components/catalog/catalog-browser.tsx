import type { ReactNode } from "react";
import { FilterChips } from "@/components/catalog/filter-chips";
import { FilterForm } from "@/components/catalog/filter-form";
import { MobileFilterDrawer } from "@/components/catalog/mobile-filter-drawer";
import { ProductGrid } from "@/components/catalog/product-grid";
import type { ProductCardData } from "@/components/catalog/product-card";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Caption, Heading } from "@/components/ui/typography";
import {
  SORT_OPTIONS,
  type CatalogFilterParams,
} from "@/lib/catalog/shop-params";
import { cn } from "@/lib/utils";
import type { CatalogFacets } from "@/server/data/repositories";
import type { Category, Collection } from "@/types/domain";

/**
 * The shared browsing surface for /shop, /search and the category and
 * collection pages: filters (desktop panel + mobile drawer), sort, chips,
 * result count, grid and pagination.
 *
 * Everything is server-rendered from the URL, so refresh, back/forward and
 * link sharing all reproduce the same view.
 */

function SortForm({
  basePath,
  active,
  sortValue,
}: {
  basePath: string;
  active: Record<string, string>;
  sortValue: string;
}) {
  // Carry the filters, drop page — changing the order restarts at page 1.
  const carried = Object.entries(active).filter(
    ([key]) => key !== "sort" && key !== "page",
  );
  return (
    <form
      method="get"
      action={basePath}
      className="flex w-full items-end gap-2 sm:w-auto"
    >
      {carried.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <FormField label="Sort by" className="min-w-0 flex-1 sm:w-52 sm:flex-none">
        <Select name="sort" defaultValue={sortValue}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormField>
      <button type="submit" className={cn(buttonStyles({ size: "sm" }), "shrink-0")}>
        Apply
      </button>
    </form>
  );
}

export interface CatalogBrowserProps {
  basePath: string;
  products: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
  active: Record<string, string>;
  sortValue: string;
  filters: CatalogFilterParams;
  filterCount: number;
  facets: CatalogFacets;
  categories: Category[];
  collections: Collection[];
  /** slug → display name, for the chips. */
  labels?: Record<string, string>;
  hideCategory?: boolean;
  hideCollection?: boolean;
  /** Shown instead of the grid when nothing matches. */
  emptyState: ReactNode;
}

export function CatalogBrowser({
  basePath,
  products,
  total,
  page,
  pageCount,
  active,
  sortValue,
  filters,
  filterCount,
  facets,
  categories,
  collections,
  labels,
  hideCategory,
  hideCollection,
  emptyState,
}: CatalogBrowserProps) {
  const filterForm = (idPrefix: string) => (
    <FilterForm
      basePath={basePath}
      filters={filters}
      facets={facets}
      categories={categories}
      collections={collections}
      hideCategory={hideCategory}
      hideCollection={hideCollection}
      sortValue={sortValue}
      idPrefix={idPrefix}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
      {/* Desktop filter panel */}
      <aside className="hidden lg:block" aria-label="Filters">
        <Heading level={3} className="mb-4 text-base">
          {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
        </Heading>
        {filterForm("desktop")}
      </aside>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-end gap-3 sm:justify-between">
          <div className="flex items-center gap-3">
            <Caption aria-live="polite">
              {total} {total === 1 ? "product" : "products"}
            </Caption>
            {/* Mobile/tablet filter entry point */}
            <span className="lg:hidden">
              <MobileFilterDrawer activeCount={filterCount}>
                {filterForm("mobile")}
              </MobileFilterDrawer>
            </span>
          </div>
          <SortForm basePath={basePath} active={active} sortValue={sortValue} />
        </div>

        <FilterChips basePath={basePath} active={active} labels={labels} />

        {total === 0 ? (
          emptyState
        ) : (
          <>
            <ProductGrid products={products} />
            <Pagination
              className="mt-10 flex justify-center"
              page={page}
              pageCount={pageCount}
              basePath={basePath}
              params={active}
            />
          </>
        )}
      </div>
    </div>
  );
}
