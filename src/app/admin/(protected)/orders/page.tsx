import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Scissors, Search, ShoppingBag } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Caption } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import type { OrderSort } from "@/server/data/repositories";
import { listAdminOrders } from "@/server/orders/admin";

export const metadata: Metadata = { title: "Admin · Orders" };

const statusOptions: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
];

const sortOptions: Array<{ value: OrderSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_desc", label: "Total: high to low" },
  { value: "total_asc", label: "Total: low to high" },
];

function asString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Admin order list (Phase 7C) — the studio's fulfillment queue. Read and
 * display only: the status vocabulary holds a single value and no
 * transition workflow exists yet, so this page deliberately mutates
 * nothing. Search, filter, sort and pagination are validated server-side
 * in the admin order service; filters are a zero-JS GET form.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const list = await listAdminOrders({
    q: asString(params.q),
    status: asString(params.status),
    sort: asString(params.sort),
    page: asString(params.page),
  });
  const { query } = list;

  const hasFilters = Boolean(query.q || query.status || query.sort !== "newest");
  const activeQuery: Record<string, string> = {};
  if (query.q) activeQuery.q = query.q;
  if (query.status) activeQuery.status = query.status;
  if (query.sort !== "newest") activeQuery.sort = query.sort;
  const hrefForPage = (target: number) => {
    const search = new URLSearchParams(activeQuery);
    search.set("page", String(target));
    return `/admin/orders?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${list.totalOrders} order${list.totalOrders === 1 ? "" : "s"} placed · ${list.statusCounts.pending ?? 0} pending`}
      />

      {list.totalOrders === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Orders placed through checkout will appear here with their stitching details for fulfilment."
        />
      ) : (
        <div className="space-y-4">
          {/* Zero-JS filtering: a plain GET form, so filters are shareable. */}
          <form
            method="get"
            action="/admin/orders"
            className="grid gap-3 rounded-2xl border border-cream-200 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="sm:col-span-2">
              <SearchInput
                name="q"
                defaultValue={query.q}
                placeholder="Order number, customer name or email"
                aria-label="Search orders"
              />
            </div>
            <FormField label="Status">
              <Select name="status" defaultValue={query.status}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sort">
              <Select name="sort" defaultValue={query.sort}>
                {sortOptions.map((option) => (
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
                  href="/admin/orders"
                  className={buttonStyles({ variant: "ghost", size: "sm" })}
                >
                  Clear filters
                </Link>
              )}
            </div>
          </form>

          {list.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No orders match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Link
                  href="/admin/orders"
                  className={buttonStyles({ variant: "outline" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <>
              <Caption>
                {list.total} order{list.total === 1 ? "" : "s"} found
              </Caption>

              <Table>
                <THead>
                  <TR>
                    <TH>Order</TH>
                    <TH>Customer</TH>
                    <TH>Items</TH>
                    <TH>Total</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.items.map((order) => (
                    <TR key={order.orderNumber}>
                      <TD>
                        <Link
                          href={`/admin/orders/${order.orderNumber}`}
                          className="font-mono text-sm font-medium text-navy-800 underline-offset-4 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <Caption className="block">
                          {formatDate(order.placedAt)}
                        </Caption>
                      </TD>
                      <TD className="min-w-0">
                        <span className="block wrap-break-word font-medium">
                          {order.customerName}
                        </span>
                        <Caption className="block wrap-break-word">
                          {order.customerEmail ?? "—"}
                        </Caption>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        {order.totalQuantity}{" "}
                        {order.totalQuantity === 1 ? "piece" : "pieces"}
                        {order.hasStitchedItems && (
                          <Badge tone="gold" className="ml-2">
                            <Scissors className="mr-1 size-3" aria-hidden />
                            Stitched
                          </Badge>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {formatPrice(order.total.amount, order.total.currency)}
                      </TD>
                      <TD>
                        <OrderStatusBadge status={order.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              {list.pageCount > 1 && (
                <nav
                  aria-label="Pagination"
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <Caption>
                    Page {query.page} of {list.pageCount}
                  </Caption>
                  <div className="flex gap-2">
                    {query.page > 1 && (
                      <Link
                        href={hrefForPage(query.page - 1)}
                        className={buttonStyles({ variant: "outline", size: "sm" })}
                      >
                        <ChevronLeft className="size-4" aria-hidden />
                        Previous
                      </Link>
                    )}
                    {query.page < list.pageCount && (
                      <Link
                        href={hrefForPage(query.page + 1)}
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
      )}
    </div>
  );
}
