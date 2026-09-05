import type { Metadata } from "next";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
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
import {
  CUSTOMIZATION_STATUS_LABELS,
  CUSTOMIZATION_STATUSES,
} from "@/server/customization/workflow";
import { listAdminCustomizations } from "@/server/customization/admin";
import type { CustomizationStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Custom Orders" };

function badgeTone(status: CustomizationStatus): "danger" | "success" | "gold" {
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "completed") return "success";
  return "gold";
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Fully custom design requests — the same CustomizationRequest data as
 * /admin/customizations, filtered to requests with no existing product
 * (onlyCustom: true). There is no separate "custom order" concept in the
 * domain model; this is a differently-scoped view over one data source.
 */
export default async function AdminCustomOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const list = await listAdminCustomizations({ ...params, onlyCustom: true });
  const hasFilters = Boolean(list.q || list.status);

  return (
    <div>
      <PageHeader
        title="Custom Orders"
        description={`${list.items.length} fully custom request${list.items.length === 1 ? "" : "s"}`}
      />

      <div className="space-y-4">
        <form
          method="get"
          action="/admin/custom-orders"
          className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-surface p-4 lg:flex-row lg:items-end"
        >
          <div className="min-w-0 flex-1">
            <SearchInput
              name="q"
              defaultValue={list.q}
              placeholder="Search request, customer or email"
              aria-label="Search custom orders"
            />
          </div>
          <FormField label="Status" className="lg:w-48 lg:shrink-0">
            <Select name="status" defaultValue={list.status}>
              <option value="">All statuses</option>
              {CUSTOMIZATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CUSTOMIZATION_STATUS_LABELS[status]}
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
              <Link href="/admin/custom-orders" className={buttonStyles({ variant: "ghost" })}>
                Clear
              </Link>
            )}
          </div>
        </form>

        {list.items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? Search : Sparkles}
            title={
              hasFilters
                ? "No custom orders match these filters"
                : "No fully custom design requests yet"
            }
            description={
              hasFilters
                ? "Try a different search term or clear the filters."
                : "Requests for a fully custom design (no existing product) will appear here. Requests based on an existing product are in Customizations."
            }
            action={
              hasFilters ? (
                <Link href="/admin/custom-orders" className={buttonStyles({ variant: "outline" })}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/admin/customizations" className={buttonStyles({ variant: "outline" })}>
                  View all customizations
                </Link>
              )
            }
          />
        ) : (
          <>
            <Caption>
              {list.items.length} request{list.items.length === 1 ? "" : "s"} found
            </Caption>

            <RowCardList>
              {list.items.map((item) => (
                <RowCard key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/customizations/${item.id}`}
                      className="min-w-0 wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                    >
                      {item.details}
                    </Link>
                    <Badge tone={badgeTone(item.status)} className="shrink-0">
                      {CUSTOMIZATION_STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                    <RowCardField label="Customer">
                      <span className="wrap-break-word">{item.customerName}</span>
                    </RowCardField>
                    <RowCardField label="Email">
                      <span className="wrap-break-word">{item.customerEmail ?? "No email"}</span>
                    </RowCardField>
                    <RowCardField label="Created">{formatDate(item.createdAt)}</RowCardField>
                  </div>
                </RowCard>
              ))}
            </RowCardList>

            <Table wrapperClassName="hidden sm:block">
              <THead>
                <TR>
                  <TH>Request</TH>
                  <TH>Customer</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {list.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="min-w-0">
                      <Link
                        href={`/admin/customizations/${item.id}`}
                        className="block wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {item.details}
                      </Link>
                    </TD>
                    <TD className="min-w-0">
                      <span className="block wrap-break-word">{item.customerName}</span>
                      <Caption className="block wrap-break-word">
                        {item.customerEmail ?? "No email"}
                      </Caption>
                    </TD>
                    <TD>
                      <Badge tone={badgeTone(item.status)}>
                        {CUSTOMIZATION_STATUS_LABELS[item.status]}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-muted">{formatDate(item.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
