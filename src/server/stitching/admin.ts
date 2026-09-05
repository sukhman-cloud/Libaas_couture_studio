import "server-only";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import { buildOrderItemViews } from "@/server/orders/service";
import type { Order, OrderItemMeasurementSnapshot, OrderStatus } from "@/types/domain";

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("orders.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

export interface StitchingWorkItem {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  orderCreatedAt: string;
  customerName: string;
  customerEmail?: string;
  itemId: string;
  productName: string;
  quantity: number;
  measurementProfileLabel?: string;
  measurements?: OrderItemMeasurementSnapshot;
  hasMeasurementSnapshot: boolean;
  notes?: string;
  customizationStatus?: string;
}

/**
 * Stitching has no independent lifecycle anywhere in this app today — no
 * stage, no tailor assignment, no priority field exists (confirmed against
 * the full domain model). This is honestly a WORKLIST derived from existing
 * order data: every stitched item on a non-terminal order, oldest first, so
 * the studio can see what needs stitching without inventing a fake status
 * workflow this app doesn't actually support yet.
 */
export async function listStitchingWorkload(): Promise<StitchingWorkItem[]> {
  await requireRead();
  const repos = getRepositories();

  // "Active" = not yet completed and not cancelled — an honest proxy for
  // "still needs work" using the only status this app actually tracks.
  const active: Order[] = [];
  for (const status of ["pending", "confirmed", "processing", "ready"] as OrderStatus[]) {
    const { rows } = await repos.orders.query({ status, limit: 0, offset: 0 });
    active.push(...rows);
  }

  const stitchedOrders = active.filter((order) =>
    order.items.some((item) => item.stitching?.selected === true),
  );

  const itemViewsPerOrder = await Promise.all(
    stitchedOrders.map((order) => buildOrderItemViews(order, order.userId)),
  );

  const work: StitchingWorkItem[] = [];
  stitchedOrders.forEach((order, orderIndex) => {
    const views = itemViewsPerOrder[orderIndex];
    views.forEach((view) => {
      if (!view.stitched) return;
      work.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        orderCreatedAt: order.createdAt,
        customerName: order.customer.name,
        ...(order.customer.email ? { customerEmail: order.customer.email } : {}),
        itemId: view.id,
        productName: view.name,
        quantity: view.quantity,
        ...(view.measurementProfileLabel ? { measurementProfileLabel: view.measurementProfileLabel } : {}),
        ...(view.measurements ? { measurements: view.measurements } : {}),
        hasMeasurementSnapshot: view.hasMeasurementSnapshot,
        ...(view.notes ? { notes: view.notes } : {}),
        ...(view.customization ? { customizationStatus: view.customization.status } : {}),
      });
    });
  });

  return work.sort((a, b) => a.orderCreatedAt.localeCompare(b.orderCreatedAt));
}
