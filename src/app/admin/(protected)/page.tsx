import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Package,
  PackageX,
  Plus,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/orders/payment-status-badge";
import { ShippingStatusBadge } from "@/components/orders/shipping-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { cn, formatPrice } from "@/lib/utils";
import { getRepositories } from "@/server/data";
import {
  listAdminOrders,
  type AdminOrderListItem,
} from "@/server/orders/admin";
import { listAdminInventoryPage } from "@/server/inventory/admin";
import { listAdminCustomizations } from "@/server/customization/admin";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@/server/orders/workflow";
import type { CustomizationStatus, OrderStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Dashboard" };

const RECENT_ORDERS_LIMIT = 6;
const NEEDS_ATTENTION_LIMIT = 8;
const LOW_STOCK_LIMIT = 5;
const CUSTOMIZATION_LIMIT = 5;
const STITCHING_LIMIT = 6;

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

/* ── "Needs attention" item shape ───────────────────────────────────
 * Every item is derived from data a repository/service already returns
 * — nothing here is invented. Each carries exactly what an admin needs
 * to act: what's wrong, a reference, current status, and where to go.
 */
interface AttentionItem {
  key: string;
  icon: typeof AlertTriangle;
  tone: "danger" | "gold";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

function orderAttentionItems(orders: AdminOrderListItem[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const order of orders) {
    if (order.paymentStatus === "failed") {
      items.push({
        key: `${order.orderNumber}-payment`,
        icon: AlertTriangle,
        tone: "danger",
        title: `Payment failed — ${order.orderNumber}`,
        detail: `${order.customerName} · ${formatPrice(order.total.amount, order.total.currency)}`,
        href: `/admin/orders/${order.orderNumber}`,
        actionLabel: "Resolve payment",
      });
      continue;
    }
    if (order.shipmentStatus === "delivery_failed" || order.shipmentStatus === "returned") {
      items.push({
        key: `${order.orderNumber}-shipment`,
        icon: Truck,
        tone: "danger",
        title: `Delivery ${order.shipmentStatus === "returned" ? "returned" : "failed"} — ${order.orderNumber}`,
        detail: `${order.customerName} · ${formatPrice(order.total.amount, order.total.currency)}`,
        href: `/admin/orders/${order.orderNumber}`,
        actionLabel: "Review shipment",
      });
      continue;
    }
    if (
      order.status !== "cancelled" &&
      order.status !== "completed" &&
      !order.fulfillmentReady
    ) {
      items.push({
        key: `${order.orderNumber}-fulfillment`,
        icon: Package,
        tone: "gold",
        title: `Not ready to fulfil — ${order.orderNumber}`,
        detail: `${order.customerName} · ${ORDER_STATUS_LABELS[order.status]}`,
        href: `/admin/orders/${order.orderNumber}`,
        actionLabel: "See what's blocking it",
      });
      continue;
    }
    if (order.status === "pending") {
      items.push({
        key: `${order.orderNumber}-pending`,
        icon: Clock,
        tone: "gold",
        title: `Awaiting confirmation — ${order.orderNumber}`,
        detail: `${order.customerName} · placed ${dateFormatter.format(new Date(order.placedAt))}`,
        href: `/admin/orders/${order.orderNumber}`,
        actionLabel: "Confirm order",
      });
    }
  }
  return items;
}

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  const role = session?.role;
  const can = (permission: Parameters<typeof hasPermission>[1]) =>
    role ? hasPermission(role, permission) : false;

  const canReadInventory = can("inventory.read");
  const canReadCustomers = can("customers.read");

  const repos = getRepositories();

  const [
    productCount,
    customerCount,
    appointmentCount,
    recentOrders,
    pendingOrders,
    lowStockInventory,
    allCustomizations,
  ] = await Promise.all([
    repos.products.countActive(),
    canReadCustomers ? repos.customers.count() : Promise.resolve(null),
    repos.appointments.count(),
    // One real page of recent orders — every row already carries payment/
    // shipment status and fulfillment readiness, so it's the base for
    // both "Recent orders" and most of "Needs attention" below.
    listAdminOrders({ sort: "newest", page: "1" }),
    // A second, targeted query using the server-side status filter that
    // already exists — gives an accurate "awaiting confirmation" queue
    // beyond just what's on the newest page.
    listAdminOrders({ status: "pending", sort: "oldest", page: "1" }),
    canReadInventory
      ? listAdminInventoryPage({ lowStockOnly: true, page: 1 })
      : Promise.resolve(null),
    listAdminCustomizations({}),
  ]);

  const statusCounts = recentOrders.statusCounts;
  const totalOrders = recentOrders.totalOrders;

  // "Needs attention": payment/shipment problems and non-ready orders come
  // from the recent-orders page (real, joined data — see the comment on
  // AdminOrderListItem.fulfillmentReady for why this is a recent-window
  // scan rather than a full-store query: no bulk payment/shipment query
  // exists yet). The pending-orders queue is a full, accurate count via
  // the server-side status filter, so it isn't limited to "recent".
  const byOrderNumber = new Map(recentOrders.items.map((o) => [o.orderNumber, o]));
  for (const order of pendingOrders.items) {
    if (!byOrderNumber.has(order.orderNumber)) byOrderNumber.set(order.orderNumber, order);
  }
  const scannedOrders = [...byOrderNumber.values()];

  const openCustomizations = allCustomizations.items.filter(
    (item) => item.status === "pending" || item.status === "reviewing",
  );
  const customizationAttention: AttentionItem[] = openCustomizations
    .slice(0, NEEDS_ATTENTION_LIMIT)
    .map((item) => ({
      key: `customization-${item.id}`,
      icon: Sparkles,
      tone: "gold" as const,
      title: `Customization ${CUSTOMIZATION_STATUS_LABELS[item.status].toLowerCase()} — ${item.customerName}`,
      detail: item.details,
      href: `/admin/customizations/${item.id}`,
      actionLabel: "Review request",
    }));

  const inventoryAttention: AttentionItem[] = canReadInventory && lowStockInventory
    ? lowStockInventory.items.slice(0, NEEDS_ATTENTION_LIMIT).map((item) => ({
        key: `inventory-${item.productId}`,
        icon: item.status === "out_of_stock" ? PackageX : Package,
        tone: item.status === "out_of_stock" ? ("danger" as const) : ("gold" as const),
        title: `${item.status === "out_of_stock" ? "Out of stock" : "Low stock"} — ${item.productName}`,
        detail: `${item.sku} · ${item.quantityAvailable} available`,
        href: `/admin/inventory/${item.productId}`,
        actionLabel: "Restock",
      }))
    : [];

  const needsAttention = [
    ...orderAttentionItems(scannedOrders),
    ...inventoryAttention,
    ...customizationAttention,
  ]
    // Real problems (payment/shipment failures, out-of-stock) before
    // routine pending work — an admin's eye should land there first.
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1))
    .slice(0, NEEDS_ATTENTION_LIMIT);

  // Stitching work: there is no separate stitching workflow/status in the
  // backend (confirmed) — stitching is a boolean on each order item. This
  // section is genuinely derived: non-terminal orders that contain at
  // least one stitched item, from the same recent-orders data above.
  const stitchingOrders = scannedOrders.filter(
    (o) => o.hasStitchedItems && o.status !== "completed" && o.status !== "cancelled",
  );

  const pendingConfirmationTotal = statusCounts.pending ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level={1} className="text-2xl sm:text-3xl">
            Dashboard
          </Heading>
          <Text tone="muted" size="sm" className="mt-1">
            What needs your attention, right now.
          </Text>
        </div>
        {role && (
          <Badge tone="navy" className="gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden />
            Signed in as {role}
          </Badge>
        )}
      </div>

      {/* ── 1. NEEDS ATTENTION ──────────────────────────────────────── */}
      <section aria-labelledby="needs-attention-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Heading level={2} id="needs-attention-heading" className="text-lg">
            Needs attention
          </Heading>
          {needsAttention.length > 0 && (
            <Badge tone={needsAttention.some((i) => i.tone === "danger") ? "danger" : "gold"}>
              {needsAttention.length} item{needsAttention.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        {needsAttention.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing needs attention right now"
            description="Payment failures, delivery problems, low stock and open requests will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {needsAttention.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-center",
                    item.tone === "danger"
                      ? "border-danger/30 bg-danger/5 hover:bg-danger/10"
                      : "border-gold-500/30 bg-gold-100/40 hover:bg-gold-100/70",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.tone === "danger" ? "bg-danger/15 text-danger" : "bg-gold-500/20 text-gold-700",
                      )}
                    >
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="wrap-break-word font-medium text-navy-800">{item.title}</p>
                      <Caption className="mt-0.5 block wrap-break-word">{item.detail}</Caption>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap pl-12 text-sm font-medium underline-offset-4 sm:pl-0",
                      item.tone === "danger" ? "text-danger" : "text-gold-700",
                    )}
                  >
                    {item.actionLabel} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 2. ORDER PIPELINE ───────────────────────────────────────── */}
      <section aria-labelledby="pipeline-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Heading level={2} id="pipeline-heading" className="text-lg">
            Order pipeline
          </Heading>
          <Link href="/admin/orders" className="text-sm text-navy-700 underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ORDER_STATUSES.map((status) => (
            <Link key={status} href={`/admin/orders?status=${status}`}>
              <Card className="transition-colors hover:border-navy-300">
                <CardContent className="p-3 sm:p-4">
                  <p className="font-display text-2xl font-semibold text-navy-800">
                    {statusCounts[status] ?? 0}
                  </p>
                  <p className="mt-0.5 truncate text-xs uppercase tracking-wider text-muted">
                    {ORDER_STATUS_LABELS[status as OrderStatus]}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <Caption className="mt-2 block">
          {totalOrders} order{totalOrders === 1 ? "" : "s"} total
          {pendingConfirmationTotal > 0 &&
            ` · ${pendingConfirmationTotal} awaiting confirmation`}
        </Caption>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 3. FULFILLMENT / SHIPPING ──────────────────────────────── */}
        <section aria-labelledby="fulfillment-heading">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Heading level={2} id="fulfillment-heading" className="text-lg">
                  Fulfillment
                </Heading>
                <Link href="/admin/orders" className="text-sm text-navy-700 underline-offset-4 hover:underline">
                  View all
                </Link>
              </div>
              {(() => {
                const notReady = scannedOrders.filter(
                  (o) => o.status !== "cancelled" && o.status !== "completed" && !o.fulfillmentReady,
                );
                if (notReady.length === 0) {
                  return (
                    <EmptyState
                      icon={Truck}
                      title="No fulfillment blockers"
                      description="Orders that aren't ready to ship will appear here."
                    />
                  );
                }
                return (
                  <ul className="divide-y divide-cream-200">
                    {notReady.slice(0, RECENT_ORDERS_LIMIT).map((order) => (
                      <li key={order.orderNumber} className="py-3 first:pt-0 last:pb-0">
                        <Link href={`/admin/orders/${order.orderNumber}`} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block wrap-break-word font-mono text-sm font-medium text-navy-800">
                              {order.orderNumber}
                            </span>
                            <Caption className="block wrap-break-word">{order.customerName}</Caption>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <ShippingStatusBadge status={order.shipmentStatus} />
                            <Caption>{order.hasTracking ? "Tracking added" : "No tracking"}</Caption>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </CardContent>
          </Card>
        </section>

        {/* ── 4. INVENTORY ALERTS ─────────────────────────────────────── */}
        <section aria-labelledby="inventory-heading">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Heading level={2} id="inventory-heading" className="text-lg">
                  Inventory alerts
                </Heading>
                {canReadInventory && (
                  <Link href="/admin/inventory?filter=low" className="text-sm text-navy-700 underline-offset-4 hover:underline">
                    View all
                  </Link>
                )}
              </div>
              {!canReadInventory ? (
                <Text tone="muted" size="sm">
                  Your role does not have access to inventory.
                </Text>
              ) : !lowStockInventory || lowStockInventory.items.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Stock levels are healthy"
                  description="No tracked product is low or out of stock right now."
                />
              ) : (
                <ul className="divide-y divide-cream-200">
                  {lowStockInventory.items.slice(0, LOW_STOCK_LIMIT).map((item) => (
                    <li key={item.productId} className="py-3 first:pt-0 last:pb-0">
                      <Link href={`/admin/inventory/${item.productId}`} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block wrap-break-word font-medium text-navy-800">{item.productName}</span>
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
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── 5. CUSTOMIZATION / STITCHING WORK ───────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="customization-heading">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Heading level={2} id="customization-heading" className="text-lg">
                  Customization requests
                </Heading>
                <Link href="/admin/customizations" className="text-sm text-navy-700 underline-offset-4 hover:underline">
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
                  {openCustomizations.slice(0, CUSTOMIZATION_LIMIT).map((item) => (
                    <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <Link href={`/admin/customizations/${item.id}`} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block wrap-break-word font-medium text-navy-800">{item.customerName}</span>
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
        </section>

        <section aria-labelledby="stitching-heading">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Heading level={2} id="stitching-heading" className="text-lg">
                  Stitching in progress
                </Heading>
                <Link href="/admin/orders" className="text-sm text-navy-700 underline-offset-4 hover:underline">
                  View all
                </Link>
              </div>
              {stitchingOrders.length === 0 ? (
                <EmptyState
                  icon={Scissors}
                  title="No stitched orders in progress"
                  description="Orders with a stitching selection that aren't finished yet will appear here."
                />
              ) : (
                <ul className="divide-y divide-cream-200">
                  {stitchingOrders.slice(0, STITCHING_LIMIT).map((order) => (
                    <li key={order.orderNumber} className="py-3 first:pt-0 last:pb-0">
                      <Link href={`/admin/orders/${order.orderNumber}`} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block wrap-break-word font-mono text-sm font-medium text-navy-800">
                            {order.orderNumber}
                          </span>
                          <Caption className="block wrap-break-word">{order.customerName}</Caption>
                        </div>
                        <OrderStatusBadge status={order.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── 6. RECENT ORDERS ────────────────────────────────────────── */}
      <section aria-labelledby="recent-orders-heading">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Heading level={2} id="recent-orders-heading" className="text-lg">
                Recent orders
              </Heading>
              <Link href="/admin/orders" className="text-sm text-navy-700 underline-offset-4 hover:underline">
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
                    <Link href={`/admin/orders/${order.orderNumber}`} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block wrap-break-word font-mono text-sm font-medium text-navy-800">
                            {order.orderNumber}
                          </span>
                          <Caption className="block wrap-break-word">
                            {order.customerName} · {dateFormatter.format(new Date(order.placedAt))}
                          </Caption>
                        </div>
                        <span className="shrink-0 tabular-nums text-sm font-medium text-navy-800">
                          {formatPrice(order.total.amount, order.total.currency)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={order.status} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                        <ShippingStatusBadge status={order.shipmentStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 7. STATS + 8. QUICK ACTIONS ─────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="stats-heading">
          <Heading level={2} id="stats-heading" className="mb-3 text-lg">
            Studio overview
          </Heading>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <Package className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-wider text-muted">Active products</p>
                  <p className="font-display text-2xl font-semibold text-navy-800">{productCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <Users className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-wider text-muted">Customers</p>
                  <p className="font-display text-2xl font-semibold text-navy-800">
                    {canReadCustomers ? customerCount : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <CalendarDays className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-wider text-muted">Appointments</p>
                  <p className="font-display text-2xl font-semibold text-navy-800">{appointmentCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <ShoppingBag className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-wider text-muted">Orders</p>
                  <p className="font-display text-2xl font-semibold text-navy-800">{totalOrders}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="quick-actions-heading">
          <Heading level={2} id="quick-actions-heading" className="mb-3 text-lg">
            Quick actions
          </Heading>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/products/new" className={buttonStyles({ variant: "outline", className: "h-auto flex-col gap-2 py-4" })}>
              <Plus className="size-5" aria-hidden />
              Add product
            </Link>
            <Link href="/admin/orders" className={buttonStyles({ variant: "outline", className: "h-auto flex-col gap-2 py-4" })}>
              <ShoppingBag className="size-5" aria-hidden />
              View orders
            </Link>
            {canReadInventory && (
              <Link href="/admin/inventory" className={buttonStyles({ variant: "outline", className: "h-auto flex-col gap-2 py-4" })}>
                <Package className="size-5" aria-hidden />
                Inventory
              </Link>
            )}
            <Link href="/admin/customizations" className={buttonStyles({ variant: "outline", className: "h-auto flex-col gap-2 py-4" })}>
              <Sparkles className="size-5" aria-hidden />
              Customizations
            </Link>
            {can("staff.manage") && (
              <Link href="/admin/staff" className={buttonStyles({ variant: "outline", className: "h-auto flex-col gap-2 py-4" })}>
                <ShieldCheck className="size-5" aria-hidden />
                Staff
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
