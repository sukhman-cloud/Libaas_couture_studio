import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InventoryTrackingForm } from "@/components/admin/inventory-tracking-form";
import { StockAdjustmentForm } from "@/components/admin/stock-adjustment-form";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getAdminInventoryDetailPage } from "@/server/inventory/admin";
import { generateInventoryIdempotencyKey } from "@/server/inventory/service";

export const metadata: Metadata = { title: "Admin · Inventory detail" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const STATUS_BADGE: Record<
  "healthy" | "low" | "out_of_stock" | "not_tracked",
  { label: string; tone: "success" | "gold" | "danger" | "neutral" }
> = {
  healthy: { label: "In stock", tone: "success" },
  low: { label: "Low stock", tone: "gold" },
  out_of_stock: { label: "Out of stock", tone: "danger" },
  not_tracked: { label: "Not tracked", tone: "neutral" },
};

const MOVEMENT_LABELS: Record<string, string> = {
  initial_stock: "Initial stock",
  restock: "Restock",
  sale: "Sale",
  reservation: "Reserved (order placed)",
  reservation_release: "Released (order cancelled)",
  adjustment: "Adjustment",
  return: "Return",
  damaged: "Marked damaged",
  correction: "Correction",
};

/**
 * Admin inventory detail (Phase 13) — current stock, reservation, recent
 * movement history, and the manual adjustment / tracking-settings actions.
 * All operational data here (movement actors, order ids) is admin-only —
 * never surfaced to a customer response.
 */
export default async function AdminInventoryDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const detail = await getAdminInventoryDetailPage(productId);
  if (!detail) notFound();

  const badge = STATUS_BADGE[detail.status];

  return (
    <div>
      <PageHeader
        title={detail.productName}
        description={detail.sku}
        breadcrumb={
          <Link
            href="/admin/inventory"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to inventory
          </Link>
        }
        actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
      />

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Stock levels
              </Heading>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">On hand</span>
                <span className="tabular-nums font-medium text-navy-800">
                  {detail.quantityOnHand}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Reserved</span>
                <span className="tabular-nums">{detail.quantityReserved}</span>
              </div>
              <div className="flex items-center justify-between border-t border-cream-200 pt-2 text-sm">
                <span className="font-medium">Available</span>
                <span className="tabular-nums font-semibold text-navy-800">
                  {detail.quantityAvailable}
                </span>
              </div>
              <Caption className="block pt-1">
                Available = on hand − reserved. Reserved units are held for
                orders already placed and are not double-sold.
              </Caption>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-2 text-lg">
                Tracking settings
              </Heading>
              <InventoryTrackingForm
                productId={detail.productId}
                trackingEnabled={detail.trackingEnabled}
                lowStockThreshold={detail.lowStockThreshold}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <Heading level={2} className="mb-2 text-lg">
              Adjust stock
            </Heading>
            <Text tone="muted" size="sm" className="mb-3">
              Restock, correct a count, mark units damaged, or record a
              return. Every adjustment is recorded in the history below.
            </Text>
            <StockAdjustmentForm
              productId={detail.productId}
              idempotencyKey={generateInventoryIdempotencyKey()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <Heading level={2} className="text-lg">
              Movement history
            </Heading>
            {detail.movements.length === 0 ? (
              <Text tone="muted" size="sm" className="mt-2">
                No stock movements recorded yet.
              </Text>
            ) : (
              <ol className="mt-3 space-y-3 border-l border-cream-200 pl-4">
                {detail.movements.map((movement, index) => (
                  <li key={index} className="text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-navy-800">
                        {MOVEMENT_LABELS[movement.type] ?? movement.type}
                      </p>
                      <span
                        className={`tabular-nums font-medium ${
                          movement.quantityChange >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {movement.quantityChange >= 0 ? "+" : ""}
                        {movement.quantityChange}
                      </span>
                    </div>
                    <Caption className="block">
                      {movement.actorName} · {formatDate(movement.createdAt)}
                      {movement.orderId ? " · linked to an order" : ""}
                    </Caption>
                    {movement.reason && (
                      <p className="mt-1 text-muted">{movement.reason}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/inventory"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="size-4" aria-hidden />
            All inventory
          </Link>
        </div>
      </div>
    </div>
  );
}
