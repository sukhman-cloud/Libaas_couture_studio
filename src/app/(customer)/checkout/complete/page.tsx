import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Container, Section } from "@/components/ui/layout";
import { Heading, Text } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { getCheckoutView } from "@/server/checkout/service";

export const metadata: Metadata = {
  title: "Review complete",
  robots: { index: false, follow: false },
};

/**
 * Review-complete screen (Phase 6A). Deliberately creates and claims
 * NOTHING: no order exists yet, and the copy says so. The page re-runs the
 * full server-side validation on every render, so a hand-typed URL can
 * never show a ready state the cart and address do not actually support —
 * anything short of "ready" bounces back to /checkout.
 */
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/checkout");

  const { address } = await searchParams;
  if (typeof address !== "string" || !address) redirect("/checkout");

  const view = await getCheckoutView(user, address);
  if (view.readiness !== "ready" || view.selectedAddress?.id !== address) {
    // Bounce WITH the requested address: a still-valid non-default
    // selection must survive the round trip (otherwise the retry would
    // silently target the default address); an invalid one makes the
    // checkout page show its "not available" notice.
    redirect(`/checkout?address=${encodeURIComponent(address)}`);
  }
  const delivery = view.selectedAddress;

  return (
    <Container>
      <Section space="md">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="text-center">
            <CheckCircle2
              className="mx-auto mb-3 size-10 text-success"
              aria-hidden
            />
            <Heading level={1} className="text-2xl">
              Review complete
            </Heading>
            <Text tone="muted" className="mt-2">
              Everything checks out. Online order placement opens in an
              upcoming update — <span className="font-medium">no order has
              been placed and nothing has been charged</span>. Your bag and
              delivery details stay saved in your account.
            </Text>
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <Heading level={2} className="mb-2 text-lg">
                  Delivering to
                </Heading>
                <Text size="sm">{delivery.fullName}</Text>
                <Text tone="muted" size="sm">
                  {[
                    delivery.line1,
                    delivery.line2,
                    delivery.locality,
                    `${delivery.city}, ${delivery.state} ${delivery.postalCode}`,
                    delivery.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                <Text tone="muted" size="sm">
                  Phone: {delivery.phone}
                </Text>
              </div>

              <div className="border-t border-cream-200 pt-4">
                <Heading level={2} className="mb-2 text-lg">
                  Your bag
                </Heading>
                <ul className="space-y-1">
                  {view.items.map((item) => (
                    <li
                      key={item.itemId}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="min-w-0">
                        {item.name ?? "This piece"} × {item.quantity}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatPrice(
                          item.lineTotal.amount,
                          item.lineTotal.currency,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-cream-200 pt-3">
                  <span className="font-medium">Merchandise subtotal</span>
                  <span className="font-display text-lg font-semibold tabular-nums text-navy-800">
                    {formatPrice(view.subtotal.amount, view.subtotal.currency)}
                  </span>
                </div>
                <Text tone="muted" size="sm" className="mt-2">
                  {view.deliveryNote}
                </Text>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/cart" className={buttonStyles({ variant: "outline" })}>
              Back to bag
            </Link>
            <Link href="/shop" className={buttonStyles({ variant: "ghost" })}>
              Continue shopping
            </Link>
          </div>
        </div>
      </Section>
    </Container>
  );
}
