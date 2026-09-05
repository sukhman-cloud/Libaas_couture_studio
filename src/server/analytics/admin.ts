import "server-only";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import type { OrderStatus } from "@/types/domain";

const TREND_DAYS = 30;
/** Below this many orders in the trend window, a day-by-day chart is noise
 *  rather than insight — show an honest "not enough data yet" state
 *  instead of a chart with mostly-zero days. */
const MIN_ORDERS_FOR_TREND = 5;

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("orders.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

export interface DailyRevenuePoint {
  date: string; // YYYY-MM-DD
  orderCount: number;
  revenue: number; // paise, cancelled orders excluded
}

export interface AdminAnalyticsSummary {
  currency: string;
  hasEnoughData: boolean;
  totalOrders: number;
  statusCounts: Record<string, number>;
  /** Revenue from non-cancelled orders in the trend window. */
  windowRevenue: number;
  windowOrderCount: number;
  averageOrderValue: number;
  trend: DailyRevenuePoint[];
  topProducts: Array<{ productId: string; name: string; quantitySold: number; revenue: number }>;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Analytics computed ONLY from real Order/OrderItem data — no fabricated
 * historical sales, no metric that can't be honestly derived today. Revenue
 * excludes cancelled orders throughout (a cancelled order was never
 * fulfilled revenue). If too few orders exist, the trend section reports
 * hasEnoughData: false rather than rendering a misleading near-empty chart.
 */
export async function getAdminAnalyticsSummary(): Promise<AdminAnalyticsSummary> {
  await requireRead();
  const repos = getRepositories();

  const [totalOrders, statusCounts] = await Promise.all([
    repos.orders.count(),
    repos.orders.countByStatus(),
  ]);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

  const { rows: windowOrders } = await repos.orders.query({
    createdAtFrom: windowStart.toISOString(),
    createdAtTo: now.toISOString(),
    limit: 0,
    offset: 0,
  });

  const nonCancelled = windowOrders.filter((order) => order.status !== "cancelled");
  const currency = nonCancelled[0]?.total.currency ?? "INR";

  const byDay = new Map<string, { orderCount: number; revenue: number }>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const day = new Date(windowStart);
    day.setDate(day.getDate() + i);
    byDay.set(isoDate(day), { orderCount: 0, revenue: 0 });
  }
  for (const order of nonCancelled) {
    const key = isoDate(new Date(order.createdAt));
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.orderCount += 1;
      bucket.revenue += order.total.amount;
    }
  }
  const trend: DailyRevenuePoint[] = [...byDay.entries()].map(([date, v]) => ({ date, ...v }));

  const windowRevenue = nonCancelled.reduce((sum, order) => sum + order.total.amount, 0);
  const windowOrderCount = nonCancelled.length;
  const averageOrderValue = windowOrderCount > 0 ? Math.round(windowRevenue / windowOrderCount) : 0;

  // Uses each item's nameSnapshot (the name AT ORDER TIME) rather than a
  // live product lookup — consistent with this app's snapshot-immutability
  // rule for historical order data (never re-derive from mutable catalog
  // state), and it also means a since-deleted product still shows its name.
  const productTotals = new Map<string, { name: string; quantitySold: number; revenue: number }>();
  for (const order of nonCancelled) {
    for (const item of order.items) {
      const existing = productTotals.get(item.productId) ?? {
        name: item.nameSnapshot,
        quantitySold: 0,
        revenue: 0,
      };
      existing.quantitySold += item.quantity;
      existing.revenue += item.lineSubtotal.amount;
      productTotals.set(item.productId, existing);
    }
  }
  const topProducts = [...productTotals.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([productId, totals]) => ({ productId, ...totals }));

  return {
    currency,
    hasEnoughData: windowOrderCount >= MIN_ORDERS_FOR_TREND,
    totalOrders,
    statusCounts: statusCounts as Record<OrderStatus, number>,
    windowRevenue,
    windowOrderCount,
    averageOrderValue,
    trend,
    topProducts,
  };
}
