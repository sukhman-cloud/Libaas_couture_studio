import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Caption } from "@/components/ui/typography";
import { listAdminInventoryPage } from "@/server/inventory/admin";

export const metadata: Metadata = { title: "Admin · Inventory" };

function asString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const STATUS_BADGE: Record<
  "healthy" | "low" | "out_of_stock" | "not_tracked",
  { label: string; tone: "success" | "gold" | "danger" | "neutral" }
> = {
  healthy: { label: "In stock", tone: "success" },
  low: { label: "Low stock", tone: "gold" },
  out_of_stock: { label: "Out of stock", tone: "danger" },
  not_tracked: { label: "Not tracked", tone: "neutral" },
};

const filterOptions = [
  { value: "", label: "All products" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

/**
 * Admin inventory list (Phase 13). Only products with tracking ENABLED
 * ever appear here with a real stock state — a product with no inventory
 * row at all is not shown, since there is nothing operational to manage
 * for it (its availability is the existing ProductAvailability enum,
 * managed from the catalog page instead). Search/filter/pagination are a
 * zero-JS GET form, matching the admin orders list's pattern exactly.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = asString(params.q);
  const filter = asString(params.filter);
  const page = Number(asString(params.page)) || 1;

  const list = await listAdminInventoryPage({
    search: q || undefined,
    lowStockOnly: filter === "low",
    outOfStockOnly: filter === "out",
    page,
  });

  const hasFilters = Boolean(q || filter);
  const activeQuery: Record<string, string> = {};
  if (q) activeQuery.q = q;
  if (filter) activeQuery.filter = filter;
  const hrefForPage = (target: number) => {
    const search = new URLSearchParams(activeQuery);
    search.set("page", String(target));
    return `/admin/inventory?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels, reservations and low-stock alerts for tracked products."
      />

      <div className="space-y-4">
        <form
          method="get"
          action="/admin/inventory"
          className="grid gap-3 rounded-2xl border border-cream-200 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <SearchInput
              name="q"
              defaultValue={q}
              placeholder="Product name or SKU"
              aria-label="Search inventory"
            />
          </div>
          <FormField label="Status">
            <Select name="filter" defaultValue={filter}>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonStyles({ size: "sm" })}>
              <Search className="size-4" aria-hidden />
              Apply
            </button>
            {hasFilters && (
              <Link
                href="/admin/inventory"
                className={buttonStyles({ variant: "ghost", size: "sm" })}
              >
                Clear
              </Link>
            )}
          </div>
        </form>

        {list.total === 0 ? (
          <EmptyState
            icon={Boxes}
            title={hasFilters ? "No products match these filters" : "No tracked products yet"}
            description={
              hasFilters
                ? "Try a different search term or clear the filters."
                : "Enable stock tracking from a product's inventory detail page to start managing it here."
            }
            action={
              hasFilters ? (
                <Link href="/admin/inventory" className={buttonStyles({ variant: "outline" })}>
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <Caption>
              {list.total} product{list.total === 1 ? "" : "s"} found
            </Caption>

            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>On hand</TH>
                  <TH>Reserved</TH>
                  <TH>Available</TH>
                  <TH>Threshold</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.items.map((item) => {
                  const badge = STATUS_BADGE[item.status];
                  return (
                    <TR key={item.productId}>
                      <TD className="min-w-0">
                        <Link
                          href={`/admin/inventory/${item.productId}`}
                          className="block wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                        >
                          {item.productName}
                        </Link>
                        <Caption className="block">{item.sku}</Caption>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">{item.quantityOnHand}</TD>
                      <TD className="whitespace-nowrap tabular-nums">{item.quantityReserved}</TD>
                      <TD className="whitespace-nowrap tabular-nums">{item.quantityAvailable}</TD>
                      <TD className="whitespace-nowrap tabular-nums text-muted">
                        {item.lowStockThreshold}
                      </TD>
                      <TD>
                        <Badge tone={badge.tone}>
                          {item.status === "low" && (
                            <AlertTriangle className="mr-1 size-3" aria-hidden />
                          )}
                          {badge.label}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {list.pageCount > 1 && (
              <nav
                aria-label="Pagination"
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <Caption>
                  Page {page} of {list.pageCount}
                </Caption>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={hrefForPage(page - 1)}
                      className={buttonStyles({ variant: "outline", size: "sm" })}
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                      Previous
                    </Link>
                  )}
                  {page < list.pageCount && (
                    <Link
                      href={hrefForPage(page + 1)}
                      className={buttonStyles({ variant: "outline", size: "sm" })}
                    >
                      Next
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
