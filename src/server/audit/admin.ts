import "server-only";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";

const FETCH_PER_SOURCE = 100;
const PAGE_SIZE = 30;

export type AuditEntrySource = "order" | "payment" | "shipment" | "customization" | "inventory";

export interface AuditEntry {
  source: AuditEntrySource;
  id: string;
  type: string;
  actorName: string;
  fromStatus?: string;
  toStatus?: string;
  /** Human-readable subject line, e.g. an order number or product name. */
  subject: string;
  subjectHref?: string;
  createdAt: string;
}

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("orders.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

/**
 * Merged, paginated recent-activity feed across every activity log this
 * app has (order/payment/shipment/customization status changes + inventory
 * movements). There is no single audit table — each source is fetched
 * newest-first and merged in application code, same "load and compose"
 * pattern listAdminOrders already uses for its own two-query merge.
 */
export async function listAdminAuditLog(raw: { page?: string }): Promise<{
  items: AuditEntry[];
  total: number;
  pageSize: number;
  page: number;
}> {
  await requireRead();
  const repos = getRepositories();
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const [orderActivities, paymentActivities, shipmentActivities, customizationActivities, inventoryMovements] =
    await Promise.all([
      repos.orderActivities.listRecent(FETCH_PER_SOURCE),
      repos.paymentActivities.listRecent(FETCH_PER_SOURCE),
      repos.shipmentActivities.listRecent(FETCH_PER_SOURCE),
      repos.customizationActivities.listRecent(FETCH_PER_SOURCE),
      repos.inventoryMovements.listRecent(FETCH_PER_SOURCE),
    ]);

  const [orders, products] = await Promise.all([
    Promise.all(
      [...new Set([
        ...orderActivities.map((a) => a.orderId),
        ...paymentActivities.map((a) => a.orderId),
        ...shipmentActivities.map((a) => a.orderId),
      ])].map((id) => repos.orders.getById(id)),
    ),
    Promise.all(
      [...new Set(inventoryMovements.map((m) => m.productId))].map((id) => repos.products.getById(id)),
    ),
  ]);
  const orderById = new Map(orders.filter((o) => o !== null).map((o) => [o.id, o]));
  const productById = new Map(products.filter((p) => p !== null).map((p) => [p.id, p]));

  const actorIds = [...new Set([
    ...orderActivities.map((a) => a.actorUserId),
    ...paymentActivities.map((a) => a.actorUserId),
    ...shipmentActivities.map((a) => a.actorUserId),
    ...customizationActivities.map((a) => a.actorUserId),
    ...inventoryMovements.map((m) => m.actorUserId),
  ].filter((id): id is string => Boolean(id)))];
  const actors = await Promise.all(actorIds.map((id) => repos.users.getById(id)));
  const actorNames = new Map(actorIds.map((id, i) => [id, actors[i]?.name]));
  const actorName = (id?: string) => (id ? (actorNames.get(id) ?? "Former staff member") : "System");

  const requestUsers = await Promise.all(
    [...new Set(customizationActivities.map((a) => a.customizationRequestId))].map((id) =>
      repos.customizationRequests.getById(id),
    ),
  );
  const requestById = new Map(requestUsers.filter((r) => r !== null).map((r) => [r.id, r]));

  const entries: AuditEntry[] = [
    ...orderActivities.map((a): AuditEntry => {
      const order = orderById.get(a.orderId);
      return {
        source: "order",
        id: a.id,
        type: a.type,
        actorName: actorName(a.actorUserId),
        ...(a.fromStatus ? { fromStatus: a.fromStatus } : {}),
        ...(a.toStatus ? { toStatus: a.toStatus } : {}),
        subject: order ? `Order ${order.orderNumber}` : "Order",
        ...(order ? { subjectHref: `/admin/orders/${order.orderNumber}` } : {}),
        createdAt: a.createdAt,
      };
    }),
    ...paymentActivities.map((a): AuditEntry => {
      const order = orderById.get(a.orderId);
      return {
        source: "payment",
        id: a.id,
        type: a.type,
        actorName: actorName(a.actorUserId),
        ...(a.fromStatus ? { fromStatus: a.fromStatus } : {}),
        ...(a.toStatus ? { toStatus: a.toStatus } : {}),
        subject: order ? `Payment · Order ${order.orderNumber}` : "Payment",
        ...(order ? { subjectHref: `/admin/orders/${order.orderNumber}` } : {}),
        createdAt: a.createdAt,
      };
    }),
    ...shipmentActivities.map((a): AuditEntry => {
      const order = orderById.get(a.orderId);
      return {
        source: "shipment",
        id: a.id,
        type: a.type,
        actorName: actorName(a.actorUserId),
        ...(a.fromStatus ? { fromStatus: a.fromStatus } : {}),
        ...(a.toStatus ? { toStatus: a.toStatus } : {}),
        subject: order ? `Shipment · Order ${order.orderNumber}` : "Shipment",
        ...(order ? { subjectHref: `/admin/orders/${order.orderNumber}` } : {}),
        createdAt: a.createdAt,
      };
    }),
    ...customizationActivities.map((a): AuditEntry => {
      const request = requestById.get(a.customizationRequestId);
      return {
        source: "customization",
        id: a.id,
        type: a.type,
        actorName: actorName(a.actorUserId),
        ...(a.fromStatus ? { fromStatus: a.fromStatus } : {}),
        ...(a.toStatus ? { toStatus: a.toStatus } : {}),
        subject: request ? request.details.slice(0, 60) : "Customization request",
        subjectHref: `/admin/customizations/${a.customizationRequestId}`,
        createdAt: a.createdAt,
      };
    }),
    ...inventoryMovements.map((m): AuditEntry => {
      const product = productById.get(m.productId);
      return {
        source: "inventory",
        id: m.id,
        type: m.type,
        actorName: actorName(m.actorUserId),
        subject: product ? product.name : "Inventory",
        ...(product ? { subjectHref: `/admin/inventory/${product.id}` } : {}),
        createdAt: m.createdAt,
      };
    }),
  ];

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  // NOTE: `total` is bounded by FETCH_PER_SOURCE per source (each source is
  // fetched newest-first, capped, then merged) — it is an honest count of
  // what was actually fetched, not a true all-time total across the store.
  // Good enough for a recent-activity feed; a fully paginated cross-entity
  // audit trail would need a real unified query, not this merge.
  const total = entries.length;
  const offset = (page - 1) * PAGE_SIZE;
  const items = entries.slice(offset, offset + PAGE_SIZE);

  return { items, total, pageSize: PAGE_SIZE, page };
}
