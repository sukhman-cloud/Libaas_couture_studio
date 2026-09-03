import "server-only";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { hasPermission } from "@/lib/auth/roles";
import { getRepositories } from "@/server/data";
import type { OrderSort } from "@/server/data/repositories";
import {
  buildOrderItemViews,
  isOrderNumber,
  type CustomerOrderItemView,
} from "@/server/orders/service";
import type { Money, Order, OrderAddressSnapshot } from "@/types/domain";

/**
 * Admin order reading (Phase 7C) — the studio's fulfillment view.
 *
 * READ + DISPLAY ONLY, deliberately: the status vocabulary holds a single
 * value (`pending`) and no business workflow defines transitions yet, so
 * this phase adds NO status mutation — orders stay immutable after
 * creation (§29 documented decision; the workflow phase adds actions).
 *
 * Every function authorizes the ADMIN session itself (never the customer
 * session) and returns dedicated view models — raw rows, credentials,
 * idempotency keys and internal ids never reach a component. Search
 * covers order number, customer name and customer email through the ONE
 * shared predicate; input is normalized and capped here so no unbounded
 * value reaches a repository.
 */

const ORDER_SORTS: OrderSort[] = ["newest", "oldest", "total_desc", "total_asc"];
const ORDER_STATUSES: Array<Order["status"]> = ["pending"];
export const ADMIN_ORDERS_PER_PAGE = 20;
export const ADMIN_SEARCH_MAX = 80;

async function requireOrdersRead() {
  const session = await requireAdminSession();
  if (!hasPermission(session.role, "orders.read")) redirect("/admin");
  return session;
}

/* ── view models ────────────────────────────────────────────────── */

export interface AdminOrderListItem {
  orderNumber: string;
  placedAt: string;
  status: Order["status"];
  customerName: string;
  customerEmail?: string;
  itemCount: number;
  totalQuantity: number;
  total: Money;
  hasStitchedItems: boolean;
}

/** Echo of the VALIDATED query — what the UI renders and re-links. */
export interface AdminOrderListQuery {
  q: string;
  status: Order["status"] | "";
  sort: OrderSort;
  page: number;
}

export interface AdminOrderList {
  items: AdminOrderListItem[];
  query: AdminOrderListQuery;
  pageCount: number;
  /** Rows matching the current filters. */
  total: number;
  /** All orders in the store, by status (header summary). */
  statusCounts: Record<string, number>;
  totalOrders: number;
}

export type AdminOrderItemView = CustomerOrderItemView;

export interface AdminOrderDetail {
  orderNumber: string;
  placedAt: string;
  status: Order["status"];
  customer: Order["customer"];
  shippingAddress: OrderAddressSnapshot;
  items: AdminOrderItemView[];
  currency: Order["currency"];
  subtotal: Money;
  shippingAmount: Money;
  taxAmount: Money;
  discountAmount: Money;
  total: Money;
  itemCount: number;
  totalQuantity: number;
}

/* ── queries ────────────────────────────────────────────────────── */

/**
 * Validated admin list. Raw URL params come in; everything is normalized
 * (§34): unknown status/sort fall back, the search term is trimmed and
 * capped, the page clamps into range. Pagination is server-side.
 */
export async function listAdminOrders(raw: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string | number;
}): Promise<AdminOrderList> {
  await requireOrdersRead();
  const repos = getRepositories();

  const q = (typeof raw.q === "string" ? raw.q : "")
    .trim()
    .slice(0, ADMIN_SEARCH_MAX);
  const status = ORDER_STATUSES.includes(raw.status as Order["status"])
    ? (raw.status as Order["status"])
    : "";
  const sort = ORDER_SORTS.includes(raw.sort as OrderSort)
    ? (raw.sort as OrderSort)
    : "newest";

  const [statusCounts, totalOrders, matchTotal] = await Promise.all([
    repos.orders.countByStatus(),
    repos.orders.count(),
    repos.orders
      .query({
        search: q || undefined,
        status: status || undefined,
        sort,
        limit: 0,
        offset: 0,
      })
      .then((paged) => paged.total),
  ]);
  const pageCount = Math.max(1, Math.ceil(matchTotal / ADMIN_ORDERS_PER_PAGE));
  const parsed = Number(raw.page);
  const page =
    Number.isInteger(parsed) && parsed >= 1
      ? Math.min(parsed, pageCount)
      : 1;

  const paged = await repos.orders.query({
    search: q || undefined,
    status: status || undefined,
    sort,
    limit: ADMIN_ORDERS_PER_PAGE,
    offset: (page - 1) * ADMIN_ORDERS_PER_PAGE,
  });

  return {
    items: paged.rows.map((order) => ({
      orderNumber: order.orderNumber,
      placedAt: order.createdAt,
      status: order.status,
      customerName: order.customer.name,
      ...(order.customer.email ? { customerEmail: order.customer.email } : {}),
      itemCount: order.items.length,
      totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
      total: order.total,
      hasStitchedItems: order.items.some(
        (i) => i.stitching?.selected === true,
      ),
    })),
    query: { q, status, sort, page },
    pageCount,
    total: paged.total,
    statusCounts,
    totalOrders,
  };
}

/** Admin detail by the customer-facing order number (internal ids never
 *  appear in URLs). Malformed and unknown numbers are both null → 404. */
export async function getAdminOrderByNumber(
  orderNumber: string,
): Promise<AdminOrderDetail | null> {
  await requireOrdersRead();
  if (!isOrderNumber(orderNumber)) return null;
  const order = await getRepositories().orders.getByOrderNumber(orderNumber);
  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    status: order.status,
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    items: await buildOrderItemViews(order),
    currency: order.currency,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    total: order.total,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
  };
}
