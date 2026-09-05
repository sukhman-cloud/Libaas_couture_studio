import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone, Ruler } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import { getAdminCustomer } from "@/server/customers/admin";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";

export const metadata: Metadata = { title: "Admin · Customer detail" };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await getAdminCustomer(customerId);
  if (!customer) notFound();

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={customer.isActive ? "Active customer" : "Deactivated account"}
        breadcrumb={
          <Link
            href="/admin/customers"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to customers
          </Link>
        }
        actions={
          customer.isActive ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="danger">Deactivated</Badge>
          )
        }
      />

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Contact
              </Heading>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="wrap-break-word">{customer.email ?? "No email on file"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="wrap-break-word">{customer.phone ?? "No phone on file"}</span>
                </div>
              </div>
              <Caption className="block border-t border-cream-200 pt-2">
                Joined {formatDate(customer.createdAt)} ·{" "}
                {customer.acceptsMarketing ? "Subscribed to updates" : "Not subscribed to updates"}
              </Caption>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Addresses
              </Heading>
              {customer.addresses.length === 0 ? (
                <Text tone="muted" size="sm">
                  No saved addresses.
                </Text>
              ) : (
                <ul className="space-y-3">
                  {customer.addresses.map((address) => (
                    <li key={address.id} className="text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        <div className="min-w-0">
                          <p className="font-medium text-navy-800">
                            {address.fullName}{" "}
                            {address.isDefault && (
                              <Badge tone="gold" className="ml-1 align-middle">
                                Default
                              </Badge>
                            )}
                          </p>
                          <p className="wrap-break-word text-muted">
                            {[address.line1, address.line2, address.locality, address.city, address.state, address.postalCode]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          <Caption className="block">{address.phone}</Caption>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <Heading level={2} className="text-lg">
              Measurement profiles
            </Heading>
            {customer.measurementProfiles.length === 0 ? (
              <Text tone="muted" size="sm">
                No measurement profiles saved.
              </Text>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {customer.measurementProfiles.map((profile) => (
                  <li
                    key={profile.id}
                    className="flex items-center gap-2 rounded-xl border border-cream-200 p-3 text-sm"
                  >
                    <Ruler className="size-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="wrap-break-word font-medium text-navy-800">
                        {profile.label}
                        {profile.isDefault && (
                          <Badge tone="gold" className="ml-1 align-middle">
                            Default
                          </Badge>
                        )}
                      </p>
                      <Caption className="block">
                        {profile.unit} · Updated {formatDate(profile.updatedAt)}
                      </Caption>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <Heading level={2} className="mb-3 text-lg">
              Order history
            </Heading>
            {customer.orders.length === 0 ? (
              <Text tone="muted" size="sm">
                No orders placed yet.
              </Text>
            ) : (
              <ul className="divide-y divide-cream-200">
                {customer.orders.map((order) => (
                  <li key={order.orderNumber} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/orders/${order.orderNumber}`}
                        className="font-mono font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <Caption className="block">{formatDate(order.createdAt)}</Caption>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums font-medium text-navy-800">
                        {formatPrice(order.total.amount, order.total.currency)}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <Heading level={2} className="mb-3 text-lg">
              Customization requests
            </Heading>
            {customer.customizations.length === 0 ? (
              <Text tone="muted" size="sm">
                No customization requests yet.
              </Text>
            ) : (
              <ul className="divide-y divide-cream-200">
                {customer.customizations.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/customizations/${request.id}`}
                        className="wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {request.details}
                      </Link>
                      <Caption className="block">{formatDate(request.createdAt)}</Caption>
                    </div>
                    <Badge tone="gold" className="shrink-0">
                      {CUSTOMIZATION_STATUS_LABELS[request.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/customers" className={buttonStyles({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-4" aria-hidden />
            All customers
          </Link>
        </div>
      </div>
    </div>
  );
}
