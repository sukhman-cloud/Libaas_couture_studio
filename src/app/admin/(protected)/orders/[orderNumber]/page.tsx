import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { OrderItemConfiguration } from "@/components/orders/order-item-configuration";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/orders/payment-status-badge";
import { ShippingStatusBadge } from "@/components/orders/shipping-status-badge";
import { OrderOperations } from "@/components/admin/order-operations";
import { PaymentOperations } from "@/components/admin/payment-operations";
import { ShippingOperations } from "@/components/admin/shipping-operations";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import { getAdminOrderByNumber } from "@/server/orders/admin";
import { allowedNextStatuses, ORDER_STATUS_LABELS } from "@/server/orders/workflow";
import { allowedNextShipmentStatuses, SHIPMENT_STATUS_LABELS } from "@/server/shipping/workflow";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";

export const metadata: Metadata = { title: "Admin · Order" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const ORDER_ACTIVITY_LABELS: Record<string, string> = {
  order_created: "Order created",
  order_cancelled: "Order cancelled",
  internal_note_added: "Internal note added",
  payment_created: "Payment created",
  payment_attempt_started: "Payment attempt started",
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
  payment_cancelled: "Payment cancelled",
  payment_refunded: "Payment refunded",
  payment_webhook_processed: "Payment webhook processed",
  shipment_created: "Shipment created",
  shipment_preparing: "Marked preparing",
  shipment_ready_to_ship: "Marked ready to ship",
  shipment_dispatched: "Shipment dispatched",
  shipment_out_for_delivery: "Out for delivery",
  shipment_delivered: "Delivered",
  shipment_delivery_failed: "Delivery failed",
  shipment_returned: "Returned",
  shipment_cancelled: "Shipment cancelled",
  shipment_tracking_updated: "Tracking updated",
  shipment_webhook_processed: "Shipment webhook processed",
  inventory_reserved: "Inventory reserved",
  inventory_released: "Inventory released",
};

function orderActivityLabel(activity: { type: string; toStatus?: string }): string {
  if (activity.type === "status_changed") {
    return `Status changed to ${activity.toStatus ? ORDER_STATUS_LABELS[activity.toStatus as keyof typeof ORDER_STATUS_LABELS] : "updated"}`;
  }
  return ORDER_ACTIVITY_LABELS[activity.type] ?? activity.type.replace(/_/g, " ");
}

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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment?.status ?? null} />
            <ShippingStatusBadge status={order.shipment?.status ?? null} />
          </div>
        }
      />

      <div className="space-y-5">
        {!order.fulfillmentReadiness.ready && (
          <Alert tone="warning">
            <span className="font-medium">Not ready for fulfillment.</span>{" "}
            {order.fulfillmentReadiness.blockingReasons.join(" ")}
            {order.inventoryShortfalls.length > 0 && (
              <ul className="mt-2 list-inside list-disc">
                {order.inventoryShortfalls.map((shortfall) => (
                  <li key={shortfall.productId}>
                    {shortfall.productName} — short by {shortfall.short}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Payment
              </Heading>
              {order.payment ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Status</span>
                    <PaymentStatusBadge status={order.payment.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Method</span>
                    <span className="capitalize">
                      {order.payment.method.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Amount</span>
                    <span className="tabular-nums">
                      {formatPrice(order.payment.amount.amount, order.payment.currency)}
                    </span>
                  </div>
                  {order.payment.providerPaymentId && (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-muted">Provider reference</span>
                      <span className="min-w-0 wrap-break-word text-right font-mono text-xs">
                        {order.payment.providerPaymentId}
                      </span>
                    </div>
                  )}
                  {order.payment.attempts.length > 0 && (
                    <div className="border-t border-cream-200 pt-2">
                      <Caption className="mb-1 block">Attempts</Caption>
                      <ul className="space-y-1">
                        {order.payment.attempts.map((attempt, index) => (
                          <li key={index} className="flex flex-wrap justify-between gap-x-2 text-xs text-muted">
                            <span>
                              {attempt.provider.replace(/_/g, " ")} · {attempt.status}
                            </span>
                            <span>{formatDate(attempt.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <Text tone="muted" size="sm">
                  No payment record for this order yet.
                </Text>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Shipping
              </Heading>
              {order.shipment ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Status</span>
                    <ShippingStatusBadge status={order.shipment.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Method</span>
                    <span className="capitalize">
                      {order.shipment.method.replace(/_/g, " ")}
                    </span>
                  </div>
                  {order.shipment.carrier && (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-muted">Carrier</span>
                      <span className="min-w-0 wrap-break-word text-right">
                        {order.shipment.carrier}
                      </span>
                    </div>
                  )}
                  {order.shipment.trackingNumber && (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-muted">Tracking number</span>
                      <span className="min-w-0 wrap-break-word text-right font-mono text-xs">
                        {order.shipment.trackingNumber}
                      </span>
                    </div>
                  )}
                  {order.shipment.estimatedDelivery && (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-muted">Estimated delivery</span>
                      <span className="min-w-0 wrap-break-word text-right">
                        {order.shipment.estimatedDelivery}
                      </span>
                    </div>
                  )}
                  {order.shipment.activities.length > 0 && (
                    <div className="border-t border-cream-200 pt-2">
                      <Caption className="mb-1 block">Timeline</Caption>
                      <ul className="space-y-1">
                        {order.shipment.activities.map((activity, index) => (
                          <li key={index} className="flex flex-wrap justify-between gap-x-2 text-xs text-muted">
                            <span>
                              {activity.toStatus
                                ? SHIPMENT_STATUS_LABELS[activity.toStatus]
                                : activity.type.replace(/_/g, " ")}
                            </span>
                            <span>{formatDate(activity.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <Text tone="muted" size="sm">
                  No shipment record for this order yet.
                </Text>
              )}
            </CardContent>
          </Card>

          {order.customizationRequests.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <Heading level={2} className="text-lg">
                  Customization requests
                </Heading>
                {order.customizationRequests.map((request) => (
                  <Link
                    key={request.id}
                    href={`/admin/customizations/${request.id}`}
                    className="block rounded-xl bg-cream-50 p-3 text-sm text-navy-800 underline-offset-4 hover:underline"
                  >
                    <span className="font-medium">{CUSTOMIZATION_STATUS_LABELS[request.status as keyof typeof CUSTOMIZATION_STATUS_LABELS] ?? request.status}</span>
                    <span className="mt-1 block whitespace-pre-wrap wrap-break-word text-muted">
                      {request.details}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Heading level={2} className="text-lg">
                Items to fulfil
              </Heading>
              <div className="flex flex-wrap gap-2">
                {order.fulfillmentReadiness.hasStitchedItems && (
                  <span className="rounded-full bg-cream-100 px-3 py-1 text-xs font-medium text-navy-700">
                    Stitching required
                  </span>
                )}
                {order.fulfillmentReadiness.hasCustomization && (
                  <span className="rounded-full bg-cream-100 px-3 py-1 text-xs font-medium text-navy-700">
                    Customization attached
                  </span>
                )}
              </div>
            </div>
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
                    {item.customization && (
                      <div className="rounded-xl bg-cream-50 p-3 text-sm">
                        <p className="font-medium text-navy-800">
                          Customization request · {item.customization.status}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap wrap-break-word text-muted">
                          {item.customization.details}
                        </p>
                      </div>
                    )}
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

        <OrderOperations
          orderNumber={order.orderNumber}
          nextStatuses={allowedNextStatuses(order.status)}
        />

        <PaymentOperations
          orderNumber={order.orderNumber}
          status={order.payment?.status ?? null}
        />

        <ShippingOperations
          orderNumber={order.orderNumber}
          hasShipment={order.shipment !== null}
          nextStatuses={
            order.shipment ? allowedNextShipmentStatuses(order.shipment.status) : []
          }
          carrier={order.shipment?.carrier}
          trackingNumber={order.shipment?.trackingNumber}
          estimatedDelivery={order.shipment?.estimatedDelivery}
        />

        {(order.activities.length > 0 || order.notes.length > 0) && (
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Order history
              </Heading>
              {order.activities.length > 0 && (
                <ol className="space-y-3 border-l border-cream-200 pl-4">
                  {order.activities.map((activity, index) => (
                    <li key={`${activity.createdAt}-${index}`} className="text-sm">
                      <p className="font-medium text-navy-800">
                        {orderActivityLabel(activity)}
                      </p>
                      <Caption className="block">
                        {activity.actorName} · {formatDate(activity.createdAt)}
                      </Caption>
                    </li>
                  ))}
                </ol>
              )}
              {order.notes.length > 0 && (
                <div className="space-y-3 border-t border-cream-200 pt-4">
                  <Heading level={3} className="text-base">
                    Internal notes
                  </Heading>
                  {order.notes.map((note, index) => (
                    <div key={`${note.createdAt}-${index}`} className="rounded-xl bg-cream-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap wrap-break-word">{note.body}</p>
                      <Caption className="mt-1 block">
                        {note.authorName} · {formatDate(note.createdAt)}
                      </Caption>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
