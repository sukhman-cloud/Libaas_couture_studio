import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { OrderItemConfiguration } from "@/components/orders/order-item-configuration";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import { getAdminOrderByNumber } from "@/server/orders/admin";

export const metadata: Metadata = { title: "Admin · Order" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Admin order detail (Phase 7C) — everything the studio needs to fulfil
 * the order, all of it from the order's IMMUTABLE snapshots: customer
 * details, delivery address, product names/prices and, for stitched
 * items, the order-time measurement snapshot. The customer's live
 * profile/address/product records are never consulted here, and no
 * mutation exists on this page (the status workflow is a later phase).
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getAdminOrderByNumber(orderNumber);
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(order.placedAt)} · ${order.customer.name} · ${order.totalQuantity} ${order.totalQuantity === 1 ? "piece" : "pieces"}`}
        breadcrumb={
          <Link
            href="/admin/orders"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to orders
          </Link>
        }
        actions={<OrderStatusBadge status={order.status} />}
      />

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-2 text-lg">
                Customer
              </Heading>
              <Text size="sm">{order.customer.name}</Text>
              <Text tone="muted" size="sm">
                {order.customer.email ?? "No email on the order"}
              </Text>
              <Text tone="muted" size="sm">
                {order.customer.phone ?? "No phone on the order"}
              </Text>
              <Caption className="mt-2 block">
                Snapshot taken when the order was placed — later profile
                edits do not change it.
              </Caption>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-2 text-lg">
                Delivery address
              </Heading>
              <Text size="sm">{order.shippingAddress.fullName}</Text>
              <Text tone="muted" size="sm">
                {[
                  order.shippingAddress.line1,
                  order.shippingAddress.line2,
                  order.shippingAddress.locality,
                  `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`,
                  order.shippingAddress.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
              <Text tone="muted" size="sm">
                Phone: {order.shippingAddress.phone}
              </Text>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-5 p-4 sm:p-5">
            <Heading level={2} className="text-lg">
              Items to fulfil
            </Heading>
            <ul className="space-y-5">
              {order.items.map((item, index) => (
                <li
                  key={`${item.slug}-${index}`}
                  className="flex gap-4 border-t border-cream-200 pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-cream-100 sm:size-24">
                    {item.image ? (
                      <Image
                        src={`/api/media/${item.image.mediaId}`}
                        alt={item.image.alt}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-full items-center justify-center text-muted"
                        aria-hidden
                      >
                        <ImageOff className="size-5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="wrap-break-word font-medium text-navy-800">
                          {item.name}
                        </p>
                        <Caption className="block">
                          Qty {item.quantity} ·{" "}
                          {formatPrice(item.unitPrice.amount, item.unitPrice.currency)}{" "}
                          each
                        </Caption>
                      </div>
                      <p className="tabular-nums font-medium text-navy-800">
                        {formatPrice(
                          item.lineSubtotal.amount,
                          item.lineSubtotal.currency,
                        )}
                      </p>
                    </div>

                    <OrderItemConfiguration
                      stitched={item.stitched}
                      measurementProfileLabel={item.measurementProfileLabel}
                      measurements={item.measurements}
                      notes={item.notes}
                      hasCustomizationRequest={item.hasCustomizationRequest}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t border-cream-200 pt-4 text-sm">
              <div className="flex justify-between text-muted">
                <span>Merchandise subtotal</span>
                <span className="tabular-nums">
                  {formatPrice(order.subtotal.amount, order.subtotal.currency)}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Shipping</span>
                <span className="tabular-nums">
                  {formatPrice(
                    order.shippingAmount.amount,
                    order.shippingAmount.currency,
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax</span>
                <span className="tabular-nums">
                  {formatPrice(order.taxAmount.amount, order.taxAmount.currency)}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Discount</span>
                <span className="tabular-nums">
                  {formatPrice(
                    order.discountAmount.amount,
                    order.discountAmount.currency,
                  )}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="font-medium">Order total</span>
                <span className="font-display text-lg font-semibold tabular-nums text-navy-800">
                  {formatPrice(order.total.amount, order.total.currency)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/orders"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft className="size-4" aria-hidden />
            All orders
          </Link>
        </div>
      </div>
    </div>
  );
}
