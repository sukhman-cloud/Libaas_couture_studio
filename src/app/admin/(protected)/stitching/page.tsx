import type { Metadata } from "next";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderItemConfiguration } from "@/components/orders/order-item-configuration";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Caption } from "@/components/ui/typography";
import { listStitchingWorkload } from "@/server/stitching/admin";

export const metadata: Metadata = { title: "Admin · Stitching" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminStitchingPage() {
  const work = await listStitchingWorkload();

  return (
    <div>
      <PageHeader
        title="Stitching"
        description={`${work.length} stitched item${work.length === 1 ? "" : "s"} awaiting fulfilment`}
      />

      {work.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No stitching work in progress"
          description="Stitched items from active orders (pending, confirmed, processing or ready) will appear here with their measurements."
        />
      ) : (
        <ul className="space-y-3">
          {work.map((item) => (
            <li
              key={item.itemId}
              className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/orders/${item.orderNumber}`}
                    className="font-mono text-sm font-medium text-navy-800 underline-offset-4 hover:underline"
                  >
                    {item.orderNumber}
                  </Link>
                  <p className="wrap-break-word font-medium text-navy-800">
                    {item.productName} × {item.quantity}
                  </p>
                  <Caption className="block wrap-break-word">
                    {item.customerName}
                    {item.customerEmail ? ` · ${item.customerEmail}` : ""}
                  </Caption>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <OrderStatusBadge status={item.orderStatus} />
                  <Caption>Placed {formatDate(item.orderCreatedAt)}</Caption>
                </div>
              </div>

              <div className="mt-3 border-t border-cream-200 pt-3">
                <OrderItemConfiguration
                  stitched
                  measurementProfileLabel={item.measurementProfileLabel}
                  measurements={item.measurements}
                  notes={item.notes}
                  hasCustomizationRequest={Boolean(item.customizationStatus)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
