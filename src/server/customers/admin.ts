import "server-only";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import type { CustomerQuery, CustomerSort } from "@/server/data/repositories";
import type { CustomizationStatus, MeasurementProfile, Money, OrderStatus } from "@/types/domain";

const CUSTOMER_SORTS: readonly CustomerSort[] = ["newest", "oldest", "name_asc", "name_desc"];
const PAGE_SIZE = 20;

export interface AdminCustomerListItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  acceptsMarketing: boolean;
  orderCount: number;
  createdAt: string;
}

export interface AdminCustomerListQuery {
  q: string;
  sort: CustomerSort;
  page: number;
}

export interface AdminCustomerListResult {
  items: AdminCustomerListItem[];
  total: number;
  pageSize: number;
  query: AdminCustomerListQuery;
}

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("customers.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

export async function listAdminCustomers(raw: {
  q?: string;
  sort?: string;
  page?: string;
}): Promise<AdminCustomerListResult> {
  await requireRead();
  const q = (raw.q ?? "").trim().slice(0, 80);
  const sort = CUSTOMER_SORTS.includes(raw.sort as CustomerSort) ? (raw.sort as CustomerSort) : "newest";
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const repos = getRepositories();
  const query: CustomerQuery = {
    ...(q ? { search: q } : {}),
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  const { rows, total } = await repos.users.queryCustomers(query);
  const profiles = await Promise.all(rows.map((user) => repos.customers.getByUserId(user.id)));
  // listByUserId defaults to a 50-row page; a high explicit limit keeps this
  // count accurate for any customer's full order history rather than
  // silently capping at the default page size.
  const orderCounts = await Promise.all(
    rows.map((user) => repos.orders.listByUserId(user.id, { limit: 10_000 })),
  );

  const items: AdminCustomerListItem[] = rows.map((user, index) => ({
    id: user.id,
    name: user.name,
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    isActive: user.isActive,
    acceptsMarketing: profiles[index]?.acceptsMarketing ?? false,
    orderCount: orderCounts[index].length,
    createdAt: user.createdAt,
  }));

  return { items, total, pageSize: PAGE_SIZE, query: { q, sort, page } };
}

export interface AdminCustomerOrderSummary {
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  total: Money;
}

export interface AdminCustomerCustomizationSummary {
  id: string;
  status: CustomizationStatus;
  details: string;
  createdAt: string;
}

export interface AdminCustomerDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  acceptsMarketing: boolean;
  addresses: Array<{
    id: string;
    label: string;
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    locality?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>;
  measurementProfiles: Array<Pick<MeasurementProfile, "id" | "label" | "unit" | "isDefault" | "updatedAt">>;
  orders: AdminCustomerOrderSummary[];
  customizations: AdminCustomerCustomizationSummary[];
}

export async function getAdminCustomer(userId: string): Promise<AdminCustomerDetail | null> {
  await requireRead();
  const repos = getRepositories();
  const user = await repos.users.getById(userId);
  if (!user || user.kind !== "customer") return null;

  const [profile, measurementProfiles, orders, customizations] = await Promise.all([
    repos.customers.getByUserId(userId),
    repos.measurementProfiles.listByUserId(userId),
    repos.orders.listByUserId(userId, { limit: 10_000 }),
    repos.customizationRequests.listByUserId(userId),
  ]);

  const sortedOrders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    id: user.id,
    name: user.name,
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone ? { phone: user.phone } : {}),
    isActive: user.isActive,
    createdAt: user.createdAt,
    acceptsMarketing: profile?.acceptsMarketing ?? false,
    addresses: (profile?.addresses ?? []).map((address) => ({
      id: address.id,
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      ...(address.line2 ? { line2: address.line2 } : {}),
      ...(address.locality ? { locality: address.locality } : {}),
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.id === profile?.defaultAddressId,
    })),
    measurementProfiles: measurementProfiles.map((m) => ({
      id: m.id,
      label: m.label,
      unit: m.unit,
      isDefault: m.isDefault,
      updatedAt: m.updatedAt,
    })),
    orders: sortedOrders.map((order) => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      total: order.total,
    })),
    customizations: [...customizations]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({
        id: request.id,
        status: request.status,
        details: request.details,
        createdAt: request.createdAt,
      })),
  };
}
