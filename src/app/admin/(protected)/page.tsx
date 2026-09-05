import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Package,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { formatPrice } from "@/lib/utils";
import { getRepositories } from "@/server/data";
import { listAdminOrders } from "@/server/orders/admin";
import { listAdminInventoryPage } from "@/server/inventory/admin";
import { listAdminCustomizations } from "@/server/customization/admin";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";
import type { CustomizationStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Dashboard" };

const RECENT_ORDERS_LIMIT = 5;
const RECENT_CUSTOMIZATIONS_LIMIT = 5;
const LOW_STOCK_LIMIT = 5;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

function customizationBadgeTone(
  status: CustomizationStatus,
): "danger" | "success" | "gold" {
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "completed") return "success";
  return "gold";
}

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  const repos = getRepositories();
  const canReadInventory = session ? hasPermission(session.role, "inventory.read") : false;

  const [
    productCount,
    customerCount,
    appointmentCount,
    recentOrders,
    lowStockInventory,
    recentCustomizations,
  ] = await Promise.all([
    repos.products.countActive(),
    repos.customers.count(),
    repos.appointments.count(),
    listAdminOrders({ sort: "newest", page: "1" }),
    canReadInventory
      ? listAdminInventoryPage({ lowStockOnly: true, page: 1 })
      : Promise.resolve(null),
    listAdminCustomizations({}),
  ]);

  const stats = [
    { icon: ShoppingBag, label: "Orders", value: recentOrders.totalOrders, href: "/admin/orders" },
    { icon: Package, label: "Active products", value: productCount, href: "/admin/products" },
    { icon: Users, label: "Customers", value: customerCount, href: "/admin/customers" },
    { icon: CalendarDays, label: "Appointments", value: appointmentCount, href: "/admin/appointments" },
  ];

  const pendingCount = recentOrders.statusCounts.pending ?? 0;
  const openCustomizations = recentCustomizations.items.filter(
    (item) => item.status !== "completed" && item.status !== "rejected" && item.status !== "cancelled",
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level={1} className="text-2xl sm:text-3xl">
            Dashboard
          </Heading>
          <Text tone="muted" size="sm" className="mt-1">
            Studio overview — orders, stock and customization activity at a glance.
          </Text>
        </div>
        {pendingCount > 0 && (
          <Badge tone="gold">{pendingCount} order{pendingCount === 1 ? "" : "s"} pending</Badge>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-navy-300">
              <CardContent className="flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <stat.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-wider text-muted">
                    {stat.label}
                  </p>
                  <p className="font-display text-2xl font-semibold text-navy-800">
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Recent orders */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Heading level={2} className="text-lg">
                Recent orders
              </Heading>
              <Link
                href="/admin/orders"
                className="text-sm text-navy-700 underline-offset-4 hover:underline"
              >
                View all
              </Link>
            </div>
            {recentOrders.items.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="Orders placed through checkout will appear here."
              />
            ) : (
              <ul className="divide-y divide-cream-200">
                {recentOrders.items.slice(0, RECENT_ORDERS_LIMIT).map((order) => (
                  <li key={order.orderNumber} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="block wrap-break-word font-mono text-sm font-medium text-navy-800">
                          {order.orderNumber}
                        </span>
                        <Caption className="block wrap-break-word">
                          {order.customerName} · {dateFormatter.format(new Date(order.placedAt))}
                        </Caption>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular-nums text-sm font-medium text-navy-800">
                          {formatPrice(order.total.amount, order.total.currency)}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Heading level={2} className="text-lg">
                Low stock
              </Heading>
              {canReadInventory && (
                <Link
                  href="/admin/inventory?filter=low"
                  className="text-sm text-navy-700 underline-offset-4 hover:underline"
                >
                  View all
                </Link>
              )}
            </div>
            {!canReadInventory ? (
              <Text tone="muted" size="sm">
                Your role does not have access to inventory.
              </Text>
            ) : lowStockInventory && lowStockInventory.items.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Stock levels are healthy"
                description="No tracked product is low or out of stock right now."
              />
            ) : lowStockInventory ? (
              <ul className="divide-y divide-cream-200">
                {lowStockInventory.items.slice(0, LOW_STOCK_LIMIT).map((item) => (
                  <li key={item.productId} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/admin/inventory/${item.productId}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="block wrap-break-word font-medium text-navy-800">
                          {item.productName}
                        </span>
                        <Caption className="block">{item.sku}</Caption>
                      </div>
                      <Badge tone={item.status === "out_of_stock" ? "danger" : "gold"} className="shrink-0 gap-1">
                        <AlertTriangle className="size-3" aria-hidden />
                        {item.quantityAvailable} left
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Customization activity */}
      <Card className="mt-5">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Heading level={2} className="text-lg">
              Customization activity
            </Heading>
            <Link
              href="/admin/customizations"
              className="text-sm text-navy-700 underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          {openCustomizations.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No open requests"
              description="New customization requests needing attention will appear here."
            />
          ) : (
            <ul className="divide-y divide-cream-200">
              {openCustomizations.slice(0, RECENT_CUSTOMIZATIONS_LIMIT).map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/admin/customizations/${item.id}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="block wrap-break-word font-medium text-navy-800">
                        {item.customerName}
                      </span>
                      <Caption className="block wrap-break-word">{item.details}</Caption>
                    </div>
                    <Badge tone={customizationBadgeTone(item.status)} className="shrink-0">
                      {CUSTOMIZATION_STATUS_LABELS[item.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Text tone="muted" size="sm" className="mt-5">
        Revenue and sales reporting aren&apos;t built yet — see{" "}
        <Link href="/admin/analytics" className={buttonStyles({ variant: "ghost", size: "sm", className: "h-auto p-0 underline" })}>
          Analytics
        </Link>{" "}
        for what&apos;s planned.
      </Text>
    </div>
  );
}
