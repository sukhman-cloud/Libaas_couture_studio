import "server-only";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import { matchesText } from "@/server/data/catalog-logic";
import { PAYMENT_STATUSES } from "@/server/payments/workflow";
import type { Money, PaymentProvider, PaymentStatus } from "@/types/domain";

const PAGE_SIZE = 20;
export type AdminPaymentSort = "newest" | "oldest" | "amount_desc" | "amount_asc";
const PAYMENT_SORTS: readonly AdminPaymentSort[] = ["newest", "oldest", "amount_desc", "amount_asc"];

export interface AdminPaymentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: Money;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentListQuery {
  q: string;
  status: PaymentStatus | "";
  sort: AdminPaymentSort;
  page: number;
}

export interface AdminPaymentListResult {
  items: AdminPaymentListItem[];
  total: number;
  pageSize: number;
  statusCounts: Partial<Record<PaymentStatus, number>>;
  query: AdminPaymentListQuery;
}

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("orders.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

function sortPayments(rows: AdminPaymentListItem[], sort: AdminPaymentSort): AdminPaymentListItem[] {
  const byId = (a: AdminPaymentListItem, b: AdminPaymentListItem) => a.id.localeCompare(b.id);
  const sorted = [...rows];
  switch (sort) {
    case "oldest":
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a, b));
      break;
    case "amount_desc":
      sorted.sort((a, b) => b.amount.amount - a.amount.amount || byId(a, b));
      break;
    case "amount_asc":
      sorted.sort((a, b) => a.amount.amount - b.amount.amount || byId(a, b));
      break;
    case "newest":
    default:
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b));
      break;
  }
  return sorted;
}

/**
 * Studio-wide payment list (Batch 1 of the admin build-out). Payments have
 * no independent index beyond their owning order, so this joins against
 * Order for the customer/order-number fields — same pattern as
 * listAdminCustomizations joining CustomizationRequest → User.
 */
export async function listAdminPayments(raw: {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
}): Promise<AdminPaymentListResult> {
  await requireRead();
  const repos = getRepositories();

  const q = (raw.q ?? "").trim().slice(0, 80);
  const status = PAYMENT_STATUSES.includes(raw.status as PaymentStatus) ? (raw.status as PaymentStatus) : "";
  const sort = PAYMENT_SORTS.includes(raw.sort as AdminPaymentSort) ? (raw.sort as AdminPaymentSort) : "newest";
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const payments = await repos.payments.list();
  const orders = await Promise.all(payments.map((payment) => repos.orders.getById(payment.orderId)));

  const statusCounts: Partial<Record<PaymentStatus, number>> = {};
  for (const payment of payments) {
    statusCounts[payment.status] = (statusCounts[payment.status] ?? 0) + 1;
  }

  const joined: AdminPaymentListItem[] = payments
    .map((payment, index) => {
      const order = orders[index];
      if (!order) return null;
      const item: AdminPaymentListItem = {
        id: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.name,
        ...(order.customer.email ? { customerEmail: order.customer.email } : {}),
        provider: payment.provider,
        status: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
      return item;
    })
    .filter((item): item is AdminPaymentListItem => item !== null);

  const filtered = joined.filter(
    (item) =>
      (!status || item.status === status) &&
      (!q || matchesText([item.orderNumber, item.customerName, item.customerEmail], q)),
  );

  const sorted = sortPayments(filtered, sort);
  const total = sorted.length;
  const offset = (page - 1) * PAGE_SIZE;
  const items = sorted.slice(offset, offset + PAGE_SIZE);

  return { items, total, pageSize: PAGE_SIZE, statusCounts, query: { q, status, sort, page } };
}
