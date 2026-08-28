import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImageOff, ShoppingCart } from "lucide-react";
import { CartLineConfigurationControl } from "@/components/commerce/cart-line-configuration";
import { CartLineControls } from "@/components/commerce/cart-line-controls";
import { ClearButton } from "@/components/commerce/clear-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, Section } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { configurationIssueMessage } from "@/server/checkout/service";
import {
  EMPTY_CART_VIEW,
  getCartView,
  MAX_QUANTITY_PER_ITEM,
} from "@/server/commerce/service";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = {
  title: "Your bag",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const user = await getCustomerUser();
  // The bag belongs to an account; anonymous visitors are invited to sign
  // in rather than shown an empty page that will not persist.
  const cart = user ? await getCartView(user.id) : EMPTY_CART_VIEW;

  // Active measurement profiles for the per-line stitching control —
  // loaded once, only when some line can actually use them (Phase 7A).
  const needsProfiles =
    user !== null &&
    cart.lines.some(
      (line) => line.configuration.stitched || line.product?.stitchingAvailable,
    );
  const measurementProfiles = needsProfiles
    ? (await getRepositories().measurementProfiles.listByUserId(user!.id)).map(
        (profile) => ({ id: profile.id, label: profile.label }),
      )
    : [];

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Your bag"
          description={
            cart.itemCount > 0
              ? `${cart.totalQuantity} ${cart.totalQuantity === 1 ? "piece" : "pieces"}`
              : undefined
          }
        />

        {!user ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sign in to see your bag"
            description="Your bag is saved to your account, so it is waiting for you on any device."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/login?from=%2Fcart" className={buttonStyles()}>
                  Sign in
                </Link>
                <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                  Continue shopping
                </Link>
              </div>
            }
          />
        ) : cart.itemCount === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Pieces you add will be saved here."
            action={
              <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                Continue shopping
              </Link>
            }
          />
        ) : (
          <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
            <div className="min-w-0">
              {cart.unavailableCount > 0 && (
                <Alert tone="warning" className="mb-5">
                  {cart.unavailableCount === 1
                    ? "One piece in your bag is no longer available and is not included in the total."
                    : `${cart.unavailableCount} pieces in your bag are no longer available and are not included in the total.`}
                </Alert>
              )}
              {cart.configurationIssueCount > 0 && (
                <Alert tone="warning" className="mb-5">
                  {cart.configurationIssueCount === 1
                    ? "One stitching configuration in your bag needs attention before checkout."
                    : `${cart.configurationIssueCount} stitching configurations in your bag need attention before checkout.`}
                </Alert>
              )}

              <ul className="space-y-4">
                {cart.lines.map((line) => {
                  const name = line.product?.name ?? "This piece";
                  return (
                    <li key={line.itemId}>
                      <Card>
                        <CardContent className="flex gap-4 p-4 sm:p-5">
                          <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-cream-100 sm:size-28">
                            {line.product?.image ? (
                              <Image
                                src={`/api/media/${line.product.image.mediaId}`}
                                alt={line.product.image.alt}
                                fill
                                sizes="112px"
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
                                {line.product ? (
                                  <Link
                                    href={`/products/${line.product.slug}`}
                                    className="wrap-break-word font-display text-lg font-medium text-navy-800 underline-offset-4 hover:underline"
                                  >
                                    {line.product.name}
                                  </Link>
                                ) : (
                                  <Heading level={3} className="text-lg">
                                    This piece
                                  </Heading>
                                )}
                                <Caption className="block">
                                  {formatPrice(
                                    line.unitPrice.amount,
                                    line.unitPrice.currency,
                                  )}{" "}
                                  each
                                </Caption>
                              </div>
                              <p className="tabular-nums font-medium text-navy-800">
                                {formatPrice(
                                  line.lineTotal.amount,
                                  line.lineTotal.currency,
                                )}
                              </p>
                            </div>

                            {line.unavailable && (
                              <Badge tone="danger">
                                No longer available
                              </Badge>
                            )}

                            <CartLineConfigurationControl
                              itemId={line.itemId}
                              productName={name}
                              stitched={line.configuration.stitched}
                              measurementProfileId={
                                line.configuration.measurementProfileId
                              }
                              measurementProfileLabel={
                                line.configuration.measurementProfileLabel
                              }
                              issueMessage={
                                !line.unavailable && line.configuration.issue
                                  ? configurationIssueMessage(
                                      line.configuration,
                                      name,
                                    )
                                  : undefined
                              }
                              stitchingAvailable={
                                line.product?.stitchingAvailable ?? false
                              }
                              unavailable={line.unavailable}
                              profiles={measurementProfiles}
                            />

                            {line.priceChanged && line.product && (
                              <Text tone="muted" size="sm">
                                The price is now{" "}
                                {formatPrice(
                                  line.product.currentPrice.amount,
                                  line.product.currentPrice.currency,
                                )}
                                . Your bag still shows the price from when you
                                added it.
                              </Text>
                            )}

                            <CartLineControls
                              itemId={line.itemId}
                              productName={name}
                              quantity={line.quantity}
                              max={MAX_QUANTITY_PER_ITEM}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className="mt-6 lg:mt-0" aria-label="Bag summary">
              <Card>
                <CardContent className="space-y-3">
                  <Heading level={2} className="text-lg">
                    Summary
                  </Heading>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">
                      Subtotal ({cart.totalQuantity}{" "}
                      {cart.totalQuantity === 1 ? "piece" : "pieces"})
                    </span>
                    <span className="tabular-nums">
                      {formatPrice(cart.subtotal.amount, cart.subtotal.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-cream-200 pt-3">
                    <span className="font-medium">Total</span>
                    <span className="font-display text-xl font-semibold tabular-nums text-navy-800">
                      {formatPrice(cart.total.amount, cart.total.currency)}
                    </span>
                  </div>
                  <Text tone="muted" size="sm">
                    Delivery and any stitching charges are confirmed with the
                    studio.
                  </Text>
                  <Link
                    href="/checkout"
                    className={buttonStyles({ className: "w-full" })}
                  >
                    Proceed to checkout
                  </Link>
                  <Link
                    href="/shop"
                    className={buttonStyles({
                      variant: "outline",
                      className: "w-full",
                    })}
                  >
                    Continue shopping
                  </Link>
                  <div className="flex justify-center">
                    <ClearButton target="cart" />
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </Section>
    </Container>
  );
}
