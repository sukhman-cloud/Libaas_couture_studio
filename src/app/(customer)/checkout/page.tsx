import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ImageOff, ShoppingCart } from "lucide-react";
import { AddressSection } from "@/components/checkout/address-section";
import { ConfirmForm } from "@/components/checkout/confirm-form";
import { LineAttention } from "@/components/checkout/line-attention";
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
import {
  configurationIssueMessage,
  getCheckoutView,
} from "@/server/checkout/service";
import { generateIdempotencyKey } from "@/server/orders/service";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * Checkout (Phase 6A) — reviews the bag, the customer's details and the
 * delivery address, all assembled and validated server-side by the
 * checkout service. Creates no order (Phase 6B).
 *
 * The selected address travels in the URL (?address=<id>), so refresh and
 * the back button keep the state without any browser storage, and the
 * server re-validates ownership on every render.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/checkout");

  const { address } = await searchParams;
  const view = await getCheckoutView(
    user,
    typeof address === "string" && address ? address : undefined,
  );

  if (view.items.length === 0) {
    return (
      <Container>
        <Section space="md">
          <PageHeader title="Checkout" />
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Add a piece to your bag before checking out."
            action={
              <Link href="/shop" className={buttonStyles({ variant: "outline" })}>
                Continue shopping
              </Link>
            }
          />
        </Section>
      </Container>
    );
  }

  const blockingIssues = view.issues.filter(
    (issue) => issue.code !== "address_required" && issue.code !== "address_invalid",
  );

  return (
    <Container>
      <Section space="md">
        <PageHeader
          title="Checkout"
          description={`${view.totalQuantity} ${view.totalQuantity === 1 ? "piece" : "pieces"} · review your details before ordering`}
        />

        <Link
          href="/cart"
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to bag
        </Link>

        {blockingIssues.length > 0 && (
          <Alert tone="warning" className="mb-6">
            <span className="font-medium">
              Your bag needs attention before you can continue.
            </span>{" "}
            {blockingIssues.map((issue) => issue.message).join(" ")}
          </Alert>
        )}

        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-10">
          <div className="min-w-0 space-y-8">
            {/* ── 1. customer ─────────────────────────────────────── */}
            <section aria-labelledby="checkout-customer">
              <Heading level={2} id="checkout-customer" className="mb-3 text-xl">
                Your details
              </Heading>
              <Card>
                <CardContent className="space-y-1 p-4 sm:p-5">
                  <Text className="font-medium">{user.name}</Text>
                  <Text tone="muted" size="sm">
                    {user.email ?? "No email on file"}
                  </Text>
                  <Text tone="muted" size="sm">
                    {user.phone ?? "No phone saved"}
                  </Text>
                  <Text tone="muted" size="sm" className="pt-1">
                    Orders use your account email.{" "}
                    <Link
                      href="/account/profile"
                      className="text-navy-700 underline underline-offset-4"
                    >
                      Edit profile
                    </Link>
                  </Text>
                </CardContent>
              </Card>
            </section>

            {/* ── 2. delivery address ─────────────────────────────── */}
            <section aria-labelledby="checkout-address">
              <Heading level={2} id="checkout-address" className="mb-3 text-xl">
                Delivery address
              </Heading>
              <AddressSection
                addresses={view.addresses}
                selectedId={view.selectedAddress?.id ?? null}
                selectionRejected={view.rejectedAddressSelection}
              />
            </section>

            {/* ── 3. review items ─────────────────────────────────── */}
            <section aria-labelledby="checkout-items">
              <Heading level={2} id="checkout-items" className="mb-3 text-xl">
                Review your bag
              </Heading>
              <ul className="space-y-4">
                {view.items.map((item) => (
                  <li key={item.itemId}>
                    <Card>
                      <CardContent className="flex gap-4 p-4 sm:p-5">
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

                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              {item.slug ? (
                                <Link
                                  href={`/products/${item.slug}`}
                                  className="wrap-break-word font-display text-lg font-medium text-navy-800 underline-offset-4 hover:underline"
                                >
                                  {item.name}
                                </Link>
                              ) : (
                                <Heading level={3} className="text-lg">
                                  This piece
                                </Heading>
                              )}
                              <Caption className="block">
                                Qty {item.quantity} ·{" "}
                                {formatPrice(
                                  item.unitPrice.amount,
                                  item.unitPrice.currency,
                                )}{" "}
                                each
                              </Caption>
                            </div>
                            <p className="tabular-nums font-medium text-navy-800">
                              {formatPrice(
                                item.lineTotal.amount,
                                item.lineTotal.currency,
                              )}
                            </p>
                          </div>

                          {/* Stitching configuration (Phase 7A) —
                              profile label only; never internal keys. */}
                          {item.configuration.stitched ? (
                            <p className="flex flex-wrap items-center gap-2 text-sm">
                              <Badge tone="gold">Stitched</Badge>
                              {item.configuration.measurementProfileLabel && (
                                <span className="text-muted">
                                  Measurement:{" "}
                                  {item.configuration.measurementProfileLabel}
                                </span>
                              )}
                            </p>
                          ) : item.configuration.hasConfiguration ? (
                            <Badge tone="navy">Custom configuration attached</Badge>
                          ) : null}

                          {!item.unavailable && item.configuration.issue && (
                            <>
                              <Alert tone="warning" className="py-2">
                                {configurationIssueMessage(
                                  item.configuration,
                                  item.name ?? "this piece",
                                )}{" "}
                                Update it from your bag.
                              </Alert>
                              <LineAttention
                                itemId={item.itemId}
                                productName={item.name ?? "this piece"}
                                showAcceptPrice={false}
                              />
                            </>
                          )}

                          {item.unavailable && (
                            <>
                              <Alert tone="danger" className="py-2">
                                This piece is no longer available and blocks
                                checkout. Remove it to continue.
                              </Alert>
                              <LineAttention
                                itemId={item.itemId}
                                productName={item.name ?? "this piece"}
                                showAcceptPrice={false}
                              />
                            </>
                          )}

                          {item.priceChanged && item.currentPrice && (
                            <>
                              <Alert tone="warning" className="py-2">
                                The price of this item has changed:{" "}
                                {formatPrice(
                                  item.unitPrice.amount,
                                  item.unitPrice.currency,
                                )}{" "}
                                →{" "}
                                {formatPrice(
                                  item.currentPrice.amount,
                                  item.currentPrice.currency,
                                )}
                                . Accept the new price or remove the item to
                                continue.
                              </Alert>
                              <LineAttention
                                itemId={item.itemId}
                                productName={item.name ?? "this piece"}
                                showAcceptPrice
                                displayedPrice={item.currentPrice}
                              />
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ── summary + confirmation ────────────────────────────── */}
          <aside className="mt-8 lg:mt-0" aria-label="Order summary">
            <Card>
              <CardContent className="space-y-3">
                <Heading level={2} className="text-lg">
                  Summary
                </Heading>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    Items ({view.itemCount}
                    {view.unavailableCount > 0
                      ? `, ${view.unavailableCount} unavailable`
                      : ""}
                    )
                  </span>
                  <span className="tabular-nums">{view.totalQuantity} pcs</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Merchandise subtotal</span>
                  <span className="tabular-nums">
                    {formatPrice(view.subtotal.amount, view.subtotal.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Delivery</span>
                  <span className="text-right text-muted">
                    Confirmed by the studio
                  </span>
                </div>
                <div className="flex justify-between border-t border-cream-200 pt-3">
                  <span className="font-medium">Subtotal</span>
                  <span className="font-display text-xl font-semibold tabular-nums text-navy-800">
                    {formatPrice(view.subtotal.amount, view.subtotal.currency)}
                  </span>
                </div>
                <Text tone="muted" size="sm">
                  {view.deliveryNote} No taxes or fees are added without
                  confirmation.
                </Text>

                {/* One key per RENDER: a double-click or retry of this
                    form replays the same order; a fresh page load mints a
                    fresh key (and meets an already-empty cart). */}
                <ConfirmForm
                  addressId={view.selectedAddress?.id ?? null}
                  idempotencyKey={generateIdempotencyKey()}
                  disabled={view.readiness !== "ready"}
                  disabledReason={
                    view.readiness === "cart_invalid"
                      ? "Remove the unavailable pieces above to continue."
                      : view.readiness === "configuration_invalid"
                        ? "A stitching configuration above needs attention to continue."
                        : view.readiness === "price_changed"
                          ? "Review the price changes above to continue."
                          : view.readiness === "address_required"
                            ? "Add a delivery address to continue."
                            : undefined
                  }
                />
              </CardContent>
            </Card>
          </aside>
        </div>
      </Section>
    </Container>
  );
}
