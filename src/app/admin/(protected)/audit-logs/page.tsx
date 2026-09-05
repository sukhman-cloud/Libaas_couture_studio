import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditCard,
  Package,
  ScrollText,
  Scissors,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Caption } from "@/components/ui/typography";
import { listAdminAuditLog, type AuditEntry, type AuditEntrySource } from "@/server/audit/admin";

export const metadata: Metadata = { title: "Admin · Audit Logs" };

const SOURCE_ICON: Record<AuditEntrySource, typeof ShoppingBag> = {
  order: ShoppingBag,
  payment: CreditCard,
  shipment: Truck,
  customization: Scissors,
  inventory: Package,
};

const SOURCE_LABEL: Record<AuditEntrySource, string> = {
  order: "Order",
  payment: "Payment",
  shipment: "Shipment",
  customization: "Customization",
  inventory: "Inventory",
};

const TYPE_LABEL: Record<string, string> = {
  status_changed: "Status changed",
  order_placed: "Order placed",
  request_approved: "Request approved",
  request_rejected: "Request rejected",
  request_completed: "Request completed",
  internal_note_added: "Internal note added",
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
  payment_cancelled: "Payment cancelled",
  payment_refunded: "Payment refunded",
  payment_attempt_started: "Payment attempt started",
  payment_webhook_processed: "Payment webhook processed",
  restock: "Restock",
  adjustment: "Adjustment",
  damaged: "Marked damaged",
  correction: "Correction",
  return: "Return",
  initial_stock: "Initial stock",
  sale: "Sale",
  reservation: "Reserved",
  reservation_release: "Reservation released",
};

function describeType(type: string): string {
  return TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

function asString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function EntryRow({ entry }: { entry: AuditEntry }) {
  const Icon = SOURCE_ICON[entry.source];
  const content = (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-navy-700">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{SOURCE_LABEL[entry.source]}</Badge>
          <span className="font-medium text-navy-800">{describeType(entry.type)}</span>
        </div>
        <p className="mt-0.5 wrap-break-word text-sm text-muted">
          {entry.subject}
          {entry.fromStatus && entry.toStatus && (
            <span>
              {" "}
              · {entry.fromStatus} → {entry.toStatus}
            </span>
          )}
        </p>
        <Caption className="mt-0.5 block">
          {entry.actorName} · {formatDateTime(entry.createdAt)}
        </Caption>
      </div>
    </div>
  );

  return entry.subjectHref ? (
    <Link
      href={entry.subjectHref}
      className="-mx-2 block rounded-xl px-2 transition-colors hover:bg-cream-100/60"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const list = await listAdminAuditLog({ page: asString(params.page) });
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="A trace of order, payment, shipment, customization and inventory activity."
      />

      {list.items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No activity recorded yet"
          description="Status changes, payments, shipments and inventory movements will appear here as they happen."
        />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-cream-200 rounded-2xl border border-cream-200 bg-surface px-4">
            {list.items.map((entry) => (
              <li key={`${entry.source}-${entry.id}`}>
                <EntryRow entry={entry} />
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="flex flex-col items-center gap-2">
              <Caption>
                Page {list.page} of {pageCount}
              </Caption>
              <Pagination page={list.page} pageCount={pageCount} basePath="/admin/audit-logs" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
