import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/layout";
import { Heading, Text } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { getOwnOrderByNumber } from "@/server/orders/service";

export const metadata: Metadata = {
  title: "Order placed",
  robots: { index: false, follow: false },
};

/**
 * Order success page (Phase 6C). Loads the order by its customer-facing
 * number with an OWNERSHIP-scoped lookup — a foreign or unknown number
 * behaves identically (back to the bag), so order numbers reveal nothing.
 * The copy claims exactly what is true: the order is placed and pending;
 * no payment has been taken, no dispatch has happened.
 */
export default async function OrderPlacedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/checkout");

  const { order: orderNumber } = await searchParams;
  const order =
    typeof orderNumber === "string" && orderNumber
      ? await getOwnOrderByNumber(user.id, orderNumber)
      : null;
  if (!order) redirect("/cart");

  return (
    <Container>
      <Section space="md">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="text-center" role="status">
            <CheckCircle2
              className="mx-auto mb-3 size-10 text-success"
              aria-hidden
            />
            <Heading level={1} className="text-2xl">
              Your order has been placed.
            </Heading>
            <p className="mt-3">
              <span className="rounded-full bg-cream-100 px-4 py-2 font-mono text-sm font-semibold tracking-wider text-navy-800">
                {order.orderNumber}
              </span>
            </p>
            <Text tone="muted" className="mt-3">
              Keep this order number for your records. The studio will
              contact you to confirm payment and delivery — no payment has
              been taken online.
            </Text>
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Heading level={2} className="text-lg">
                    Your order
                  </Heading>
                  <Badge tone="gold">Pending</Badge>
                </div>
                <ul className="space-y-1">
                  {order.items.map((item, index) => (
                    <li
                      key={`${item.slug}-${index}`}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="min-w-0">
                        {item.name} × {item.quantity}
                        {item.hasConfiguration && (
                          <span className="ml-2 text-xs text-muted">
                            (custom configuration attached)
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatPrice(
                          item.lineSubtotal.amount,
                          item.lineSubtotal.currency,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-1 border-t border-cream-200 pt-3 text-sm">
                  <div className="flex justify-between text-muted">
                    <span>Merchandise subtotal</span>
                    <span className="tabular-nums">
                      {formatPrice(order.subtotal.amount, order.subtotal.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Delivery</span>
                    <span>Confirmed by the studio</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="font-medium">Order total</span>
                    <span className="font-display text-lg font-semibold tabular-nums text-navy-800">
                      {formatPrice(order.total.amount, order.total.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-cream-200 pt-4">
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
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/shop" className={buttonStyles()}>
              Continue shopping
            </Link>
            <Link href="/account" className={buttonStyles({ variant: "outline" })}>
              Your account
            </Link>
          </div>
        </div>
      </Section>
    </Container>
  );
}
