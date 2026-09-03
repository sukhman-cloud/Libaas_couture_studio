import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { OrderItemConfiguration } from "@/components/orders/order-item-configuration";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { getOwnOrderDetail } from "@/server/orders/service";

export const metadata: Metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Customer order detail (Phase 7C) — the first customer-facing consumer
 * of the Phase 7B measurement snapshot. Every value on this page comes
 * from the ORDER's own snapshots (product names/prices, the delivery
 * address, the customer details, the measurements): the catalog and the
 * customer's live profile are never consulted, so later edits can never
 * rewrite history. Malformed, unknown and foreign order numbers all 404
 * identically.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/orders");

  const { orderNumber } = await params;
  const order = await getOwnOrderDetail(user.id, orderNumber);
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDate(order.placedAt)} · ${order.totalQuantity} ${order.totalQuantity === 1 ? "piece" : "pieces"}`}
        breadcrumb={
          <Link
            href="/account/orders"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to orders
          </Link>
        }
        actions={<OrderStatusBadge status={order.status} />}
      />

      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-5 p-4 sm:p-5">
            <Heading level={2} className="text-lg">
              Items
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
                        <p className="wrap-break-word font-display text-lg font-medium text-navy-800">
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

        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-2 text-lg">
                Delivering to
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
              <Caption className="mt-2 block">
                The address recorded when this order was placed.
              </Caption>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-2 text-lg">
                Order details
              </Heading>
              <Text size="sm">{order.customer.name}</Text>
              {order.customer.email && (
                <Text tone="muted" size="sm">
                  {order.customer.email}
                </Text>
              )}
              {order.customer.phone && (
                <Text tone="muted" size="sm">
                  {order.customer.phone}
                </Text>
              )}
              <Text tone="muted" size="sm" className="mt-2">
                No payment has been taken online — the studio confirms
                payment and delivery with you.
              </Text>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
