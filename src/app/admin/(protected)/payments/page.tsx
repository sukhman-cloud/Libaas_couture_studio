import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Search } from "lucide-react";
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
import { formatPrice } from "@/lib/utils";
import { listAdminPayments, type AdminPaymentSort } from "@/server/payments/admin";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/server/payments/workflow";
import type { PaymentStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Payments" };

const PROVIDER_LABELS: Record<string, string> = {
  manual: "Manual",
  cash_on_delivery: "Cash on delivery",
  online_gateway: "Online",
};

const STATUS_TONE: Record<PaymentStatus, "gold" | "success" | "danger" | "neutral"> = {
  unpaid: "neutral",
  pending: "gold",
  authorized: "gold",
  paid: "success",
  failed: "danger",
  cancelled: "danger",
  refunded: "danger",
};

const sortOptions: Array<{ value: AdminPaymentSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Amount: high to low" },
  { value: "amount_asc", label: "Amount: low to high" },
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

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const list = await listAdminPayments({
    q: asString(params.q),
    status: asString(params.status),
    sort: asString(params.sort),
    page: asString(params.page),
  });
  const { query } = list;
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  const hasFilters = Boolean(query.q || query.status || query.sort !== "newest");
  const activeQuery: Record<string, string> = {};
  if (query.q) activeQuery.q = query.q;
  if (query.status) activeQuery.status = query.status;
  if (query.sort !== "newest") activeQuery.sort = query.sort;

  const unpaidCount = list.statusCounts.unpaid ?? 0;
  const pendingCount = list.statusCounts.pending ?? 0;

  return (
    <div>
      <PageHeader
        title="Payments"
        description={
          Object.keys(list.statusCounts).length === 0
            ? "No payments recorded yet"
            : `${unpaidCount} unpaid · ${pendingCount} pending`
        }
      />

      {Object.keys(list.statusCounts).length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments recorded yet"
          description="Payments created from checkout or recorded manually against an order will appear here."
        />
      ) : (
        <div className="space-y-4">
          <form
            method="get"
            action="/admin/payments"
            className="flex flex-col gap-3 rounded-2xl border border-cream-200 bg-surface p-4 lg:flex-row lg:items-end"
          >
            <div className="min-w-0 flex-1">
              <SearchInput
                name="q"
                defaultValue={query.q}
                placeholder="Order number, customer name or email"
                aria-label="Search payments"
              />
            </div>
            <FormField label="Status" className="lg:w-44 lg:shrink-0">
              <Select name="status" defaultValue={query.status}>
                <option value="">All statuses</option>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PAYMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </FormField>
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
                <Link href="/admin/payments" className={buttonStyles({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>

          {list.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No payments match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Link href="/admin/payments" className={buttonStyles({ variant: "outline" })}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <>
              <Caption>
                {list.total} payment{list.total === 1 ? "" : "s"} found
              </Caption>

              <RowCardList>
                {list.items.map((payment) => (
                  <RowCard key={payment.id}>
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/admin/orders/${payment.orderNumber}`}
                        className="min-w-0 font-mono text-sm font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {payment.orderNumber}
                      </Link>
                      <Badge tone={STATUS_TONE[payment.status]} className="shrink-0">
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                      <RowCardField label="Customer">
                        <span className="wrap-break-word">{payment.customerName}</span>
                      </RowCardField>
                      <RowCardField label="Amount">
                        <span className="tabular-nums">
                          {formatPrice(payment.amount.amount, payment.amount.currency)}
                        </span>
                      </RowCardField>
                      <RowCardField label="Method">
                        {PROVIDER_LABELS[payment.provider] ?? payment.provider}
                      </RowCardField>
                      <RowCardField label="Updated">{formatDate(payment.updatedAt)}</RowCardField>
                    </div>
                  </RowCard>
                ))}
              </RowCardList>

              <Table wrapperClassName="hidden sm:block">
                <THead>
                  <TR>
                    <TH>Order</TH>
                    <TH>Customer</TH>
                    <TH>Method</TH>
                    <TH>Amount</TH>
                    <TH>Status</TH>
                    <TH>Updated</TH>
                  </TR>
                </THead>
                <TBody>
                  {list.items.map((payment) => (
                    <TR key={payment.id}>
                      <TD>
                        <Link
                          href={`/admin/orders/${payment.orderNumber}`}
                          className="font-mono text-sm font-medium text-navy-800 underline-offset-4 hover:underline"
                        >
                          {payment.orderNumber}
                        </Link>
                      </TD>
                      <TD className="min-w-0">
                        <span className="block wrap-break-word font-medium">{payment.customerName}</span>
                        <Caption className="block wrap-break-word">
                          {payment.customerEmail ?? "—"}
                        </Caption>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">
                        {PROVIDER_LABELS[payment.provider] ?? payment.provider}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        {formatPrice(payment.amount.amount, payment.amount.currency)}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(payment.updatedAt)}</TD>
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
                    basePath="/admin/payments"
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
