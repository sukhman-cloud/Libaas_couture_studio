import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ImageOff, Scissors, ShoppingBag } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Caption } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { listOwnOrders } from "@/server/orders/service";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Customer order history (Phase 7C) — ownership-scoped, newest first,
 * paged. Everything rendered comes from the ORDER's own snapshots; the
 * only live lookup is the preview image (works for archived products).
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/orders");

  const { page: rawPage } = await searchParams;
  const list = await listOwnOrders(user.id, rawPage);

  return (
    <div>
      <PageHeader
        title="Orders"
        description={
          list.totalOrders > 0
            ? `${list.totalOrders} order${list.totalOrders === 1 ? "" : "s"} placed`
            : undefined
        }
      />

      {list.totalOrders === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="You haven't placed any orders yet."
          description="Pieces you order will appear here with their stitching details."
          action={
            <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
              Continue shopping
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {list.items.map((order) => (
              <li key={order.orderNumber}>
                <Card>
                  <CardContent className="flex gap-4 p-4 sm:p-5">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-cream-100 sm:size-24">
                      {order.image ? (
                        <Image
                          src={`/api/media/${order.image.mediaId}`}
                          alt={order.image.alt}
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

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/account/orders/${order.orderNumber}`}
                            className="font-mono text-sm font-semibold tracking-wider text-navy-800 underline-offset-4 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <Caption className="block">
                            {formatDate(order.placedAt)}
                          </Caption>
                        </div>
                        <OrderStatusBadge status={order.status} />
                      </div>

                      <p className="text-sm text-muted">
                        {order.firstItemName}
                        {order.itemCount > 1
                          ? ` and ${order.itemCount - 1} more`
                          : ""}{" "}
                        · {order.totalQuantity}{" "}
                        {order.totalQuantity === 1 ? "piece" : "pieces"}
                      </p>

                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums font-medium text-navy-800">
                            {formatPrice(order.total.amount, order.total.currency)}
                          </span>
                          {order.hasStitchedItems && (
                            <Badge tone="gold">
                              <Scissors className="mr-1 size-3" aria-hidden />
                              Stitched
                            </Badge>
                          )}
                        </span>
                        <Link
                          href={`/account/orders/${order.orderNumber}`}
                          className={buttonStyles({ variant: "outline", size: "sm" })}
                        >
                          View order
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {list.totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-6 flex flex-wrap items-center justify-between gap-3"
            >
              <Caption>
                Page {list.page} of {list.totalPages}
              </Caption>
              <div className="flex gap-2">
                {list.page > 1 && (
                  <Link
                    href={`/account/orders?page=${list.page - 1}`}
                    className={buttonStyles({ variant: "outline", size: "sm" })}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    Previous
                  </Link>
                )}
                {list.page < list.totalPages && (
                  <Link
                    href={`/account/orders?page=${list.page + 1}`}
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
  );
}
