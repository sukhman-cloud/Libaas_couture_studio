import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import { getAdminAnalyticsSummary } from "@/server/analytics/admin";
import { ORDER_STATUS_LABELS } from "@/server/orders/workflow";
import type { OrderStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Analytics" };

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default async function AdminAnalyticsPage() {
  const summary = await getAdminAnalyticsSummary();

  if (summary.totalOrders === 0) {
    return (
      <div>
        <PageHeader title="Analytics" description="Sales, order and customer insights" />
        <EmptyState
          icon={BarChart3}
          title="No orders yet"
          description="Once orders start coming in, revenue trends and top products will appear here."
        />
      </div>
    );
  }

  const maxDayRevenue = Math.max(1, ...summary.trend.map((point) => point.revenue));

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Last 30 days · ${summary.windowOrderCount} order${summary.windowOrderCount === 1 ? "" : "s"}`}
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Caption>Revenue (30 days)</Caption>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-800">
                {formatPrice(summary.windowRevenue, summary.currency)}
              </p>
              <Caption className="mt-1 block">Excludes cancelled orders</Caption>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Caption>Average order value</Caption>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-800">
                {formatPrice(summary.averageOrderValue, summary.currency)}
              </p>
              <Caption className="mt-1 block">Across {summary.windowOrderCount} orders</Caption>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Caption>All-time orders</Caption>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-800">
                {summary.totalOrders}
              </p>
              <Caption className="mt-1 block">Since the studio opened online</Caption>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <Heading level={2} className="text-lg">
              Daily revenue — last 30 days
            </Heading>
            {!summary.hasEnoughData ? (
              <Text tone="muted" size="sm" className="mt-3">
                Not enough orders yet in the last 30 days to show a meaningful trend. This will
                fill in as more orders come through.
              </Text>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="flex h-40 min-w-160 items-end gap-1">
                  {summary.trend.map((point) => (
                    <div
                      key={point.date}
                      className="group relative flex-1"
                      title={`${formatShortDate(point.date)}: ${formatPrice(point.revenue, summary.currency)} · ${point.orderCount} order${point.orderCount === 1 ? "" : "s"}`}
                    >
                      <div
                        className="mx-auto w-full rounded-t bg-gold-400 transition-colors group-hover:bg-gold-500"
                        style={{
                          height: `${Math.max(2, (point.revenue / maxDayRevenue) * 100)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex min-w-160 justify-between">
                  <Caption>{formatShortDate(summary.trend[0].date)}</Caption>
                  <Caption>{formatShortDate(summary.trend[summary.trend.length - 1].date)}</Caption>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-3 text-lg">
                Orders by status
              </Heading>
              <ul className="space-y-2">
                {(Object.entries(summary.statusCounts) as Array<[OrderStatus, number]>)
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between text-sm">
                      <span className="text-navy-800">{ORDER_STATUS_LABELS[status]}</span>
                      <span className="tabular-nums font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <Heading level={2} className="mb-3 text-lg">
                Top products (30 days)
              </Heading>
              {summary.topProducts.length === 0 ? (
                <Text tone="muted" size="sm">
                  No product sales in this window yet.
                </Text>
              ) : (
                <ul className="divide-y divide-cream-200">
                  {summary.topProducts.map((product) => (
                    <li key={product.productId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/inventory/${product.productId}`}
                          className="block wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                        >
                          {product.name}
                        </Link>
                        <Caption>{product.quantitySold} sold</Caption>
                      </div>
                      <span className="shrink-0 tabular-nums font-medium text-navy-800">
                        {formatPrice(product.revenue, summary.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
