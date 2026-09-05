import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import {
  RowCard,
  RowCardField,
  RowCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { Caption } from "@/components/ui/typography";
import type { CustomerSort } from "@/server/data/repositories";
import { listAdminCustomers } from "@/server/customers/admin";

export const metadata: Metadata = { title: "Admin · Customers" };

const sortOptions: Array<{ value: CustomerSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "name_desc", label: "Name: Z to A" },
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

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const list = await listAdminCustomers({
    q: asString(params.q),
    sort: asString(params.sort),
    page: asString(params.page),
  });
  const { query } = list;
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  const hasFilters = Boolean(query.q || query.sort !== "newest");
  const activeQuery: Record<string, string> = {};
  if (query.q) activeQuery.q = query.q;
  if (query.sort !== "newest") activeQuery.sort = query.sort;

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${list.total} customer${list.total === 1 ? "" : "s"}`}
      />

      {list.total === 0 && !hasFilters ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Accounts created by customers will appear here with their order and measurement history."
        />
      ) : (
        <div className="space-y-4">
          {/* Zero-JS filtering: a plain GET form, so filters are shareable. */}
          <form
            method="get"
            action="/admin/customers"
            className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-surface p-4 lg:flex-row lg:items-end"
          >
            <div className="min-w-0 flex-1">
              <SearchInput
                name="q"
                defaultValue={query.q}
                placeholder="Search name, email or phone"
                aria-label="Search customers"
              />
            </div>
            <FormField label="Sort" className="lg:w-48 lg:shrink-0">
              <Select name="sort" defaultValue={query.sort}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex gap-2">
              <button type="submit" className={buttonStyles({ className: "flex-1 lg:flex-none" })}>
                <Search className="size-4" aria-hidden />
                Apply filters
              </button>
              {hasFilters && (
                <Link href="/admin/customers" className={buttonStyles({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>

          {list.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No customers match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Link href="/admin/customers" className={buttonStyles({ variant: "outline" })}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <>
              <Caption>
                {list.total} customer{list.total === 1 ? "" : "s"} found
              </Caption>

              {/* Mobile: stacked cards. sm+: table. Same data, no scroll. */}
              <RowCardList>
                {list.items.map((customer) => (
                  <RowCard key={customer.id}>
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="min-w-0 wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {!customer.isActive && (
                        <Badge tone="danger" className="shrink-0">
                          Deactivated
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                      <RowCardField label="Email">
                        <span className="wrap-break-word">{customer.email ?? "No email"}</span>
                      </RowCardField>
                      <RowCardField label="Phone">
                        <span className="wrap-break-word">{customer.phone ?? "No phone"}</span>
                      </RowCardField>
                      <RowCardField label="Orders">{customer.orderCount}</RowCardField>
                      <RowCardField label="Joined">{formatDate(customer.createdAt)}</RowCardField>
                    </div>
                  </RowCard>
                ))}
              </RowCardList>

              <Table wrapperClassName="hidden sm:block">
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Contact</TH>
                    <TH>Orders</TH>
                    <TH>Joined</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.items.map((customer) => (
                    <TR key={customer.id}>
                      <TD className="min-w-0">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="block wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                        >
                          {customer.name}
                        </Link>
                      </TD>
                      <TD className="min-w-0">
                        <span className="block wrap-break-word">{customer.email ?? "No email"}</span>
                        <Caption className="block wrap-break-word">
                          {customer.phone ?? "No phone"}
                        </Caption>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">{customer.orderCount}</TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(customer.createdAt)}</TD>
                      <TD>
                        {customer.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="danger">Deactivated</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              {pageCount > 1 && (
                <div className="flex flex-col items-center gap-2">
                  <Caption>
                    Page {query.page} of {pageCount}
                  </Caption>
                  <Pagination
                    page={query.page}
                    pageCount={pageCount}
                    basePath="/admin/customers"
                    params={activeQuery}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
