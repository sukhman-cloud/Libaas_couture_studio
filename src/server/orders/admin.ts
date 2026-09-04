import "server-only";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { hasPermission } from "@/lib/auth/roles";
import { getRepositories } from "@/server/data";
import type { OrderSort } from "@/server/data/repositories";
import {
  buildOrderItemViews,
  isOrderNumber,
  type CustomerOrderItemView,
} from "@/server/orders/service";
import type {
  Money,
  Order,
  OrderActivity,
  OrderAddressSnapshot,
  OrderStatus,
} from "@/types/domain";
import {
  isAllowedStatusTransition,
  ORDER_STATUSES,
} from "@/server/orders/workflow";
import {
  getAdminPaymentForOrder,
  recordManualPayment,
  type AdminPaymentView,
} from "@/server/payments/service";

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
export const ADMIN_ORDERS_PER_PAGE = 20;
export const ADMIN_SEARCH_MAX = 80;
export const ADMIN_NOTE_MAX = 2000;

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

export interface AdminOrderActivityView {
  type: OrderActivity["type"];
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  actorName: string;
  createdAt: string;
}

export interface AdminOrderNoteView {
  authorName: string;
  body: string;
  createdAt: string;
}

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
  activities: AdminOrderActivityView[];
  notes: AdminOrderNoteView[];
  /** Null when the order has no payment record yet (pre-Phase-10 history
   *  or a failed initiation) — never fabricated. */
  payment: AdminPaymentView | null;
  customizationRequests: Array<{
    id: string;
    status: string;
    details: string;
    orderItemId?: string;
    createdAt: string;
  }>;
}

async function buildAdminItemViews(order: Order): Promise<AdminOrderItemView[]> {
  return buildOrderItemViews(order);
}

function activityView(activity: OrderActivity): AdminOrderActivityView {
  return {
    type: activity.type,
    ...(activity.fromStatus ? { fromStatus: activity.fromStatus } : {}),
    ...(activity.toStatus ? { toStatus: activity.toStatus } : {}),
    actorName: activity.actorUserId ?? "System",
    createdAt: activity.createdAt,
  };
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
  const [items, activities, notes, payment] = await Promise.all([
    buildAdminItemViews(order),
    getRepositories().orderActivities.listByOrderId(order.id),
    getRepositories().orderNotes.listByOrderId(order.id),
    getAdminPaymentForOrder(order),
  ]);
  const customizationRequests = (await getRepositories().customizationRequests.list()).filter(
    (request) => request.orderId === order.id,
  );

  return {
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    status: order.status,
    customer: order.customer,
    shippingAddress: order.shippingAddress,
    items,
    currency: order.currency,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    total: order.total,
    itemCount: order.items.length,
    totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
    activities: activities.map(activityView),
    notes: notes.map((note) => ({
      authorName: note.authorName,
      body: note.body,
      createdAt: note.createdAt,
    })),
    payment,
    customizationRequests: customizationRequests.map((request) => ({
      id: request.id,
      status: request.status,
      details: request.details,
      ...(request.orderItemId ? { orderItemId: request.orderItemId } : {}),
      createdAt: request.createdAt,
    })),
  };
}

export type AdminOrderMutationResult =
  | { ok: true; status?: OrderStatus }
  | { ok: false; error: string };

export async function transitionAdminOrder(
  orderNumber: string,
  nextStatus: string,
): Promise<AdminOrderMutationResult> {
  const auth = await authorizeAdmin("orders.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isOrderNumber(orderNumber)) return { ok: false, error: "Order not found." };
  if (!ORDER_STATUSES.includes(nextStatus as OrderStatus)) {
    return { ok: false, error: "That order status is not available." };
  }

  try {
    await getRepositories().transaction(async (tx) => {
      const order = await tx.orders.getByOrderNumber(orderNumber);
      if (!order) throw new Error("Order not found.");
      if (!isAllowedStatusTransition(order.status, nextStatus as OrderStatus)) {
        throw new Error("That status transition is not allowed.");
      }
      const now = new Date().toISOString();
      const updated = await tx.orders.transitionStatus(
        order.id,
        order.status,
        nextStatus as OrderStatus,
        now,
      );
      if (!updated) throw new Error("This order changed. Refresh and try again.");
      await tx.orderActivities.create({
        id: randomUUID(),
        orderId: order.id,
        type: nextStatus === "cancelled" ? "order_cancelled" : "status_changed",
        actorUserId: auth.session.sub === "dev-admin" ? undefined : auth.session.sub,
        fromStatus: order.status,
        toStatus: nextStatus as OrderStatus,
        createdAt: now,
      });
    });
    return { ok: true, status: nextStatus as OrderStatus };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the order.",
    };
  }
}

export async function addAdminOrderNote(
  orderNumber: string,
  body: string,
): Promise<AdminOrderMutationResult> {
  const auth = await authorizeAdmin("orders.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isOrderNumber(orderNumber)) return { ok: false, error: "Order not found." };
  const noteBody = body.trim();
  if (!noteBody) return { ok: false, error: "Note cannot be empty." };
  if (noteBody.length > ADMIN_NOTE_MAX) {
    return { ok: false, error: `Keep notes within ${ADMIN_NOTE_MAX} characters.` };
  }

  try {
    await getRepositories().transaction(async (tx) => {
      const order = await tx.orders.getByOrderNumber(orderNumber);
      if (!order) throw new Error("Order not found.");
      const now = new Date().toISOString();
      await tx.orderNotes.create({
        id: randomUUID(),
        orderId: order.id,
        authorUserId: auth.session.sub === "dev-admin" ? undefined : auth.session.sub,
        authorName: "Studio admin",
        body: noteBody,
        createdAt: now,
      });
      await tx.orderActivities.create({
        id: randomUUID(),
        orderId: order.id,
        type: "internal_note_added",
        actorUserId: auth.session.sub === "dev-admin" ? undefined : auth.session.sub,
        metadata: { characters: noteBody.length },
        createdAt: now,
      });
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the note.",
    };
  }
}

/**
 * Admin-only manual/offline payment recording (Phase 10 foundation). The
 * amount is always the order's authoritative total — there is no input for
 * a different figure — and the transition is validated against the same
 * payment state machine every other payment mutation uses.
 */
export async function recordAdminManualPayment(
  orderNumber: string,
): Promise<AdminOrderMutationResult> {
  const auth = await authorizeAdmin("payments.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isOrderNumber(orderNumber)) return { ok: false, error: "Order not found." };

  const order = await getRepositories().orders.getByOrderNumber(orderNumber);
  if (!order) return { ok: false, error: "Order not found." };

  const result = await recordManualPayment({
    orderId: order.id,
    ...(auth.session.sub === "dev-admin" ? {} : { actorUserId: auth.session.sub }),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
