import "server-only";
import { randomUUID } from "crypto";
import { authorizeAdmin, requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";
import type { CustomizationActivity, CustomizationRequest, CustomizationStatus } from "@/types/domain";
import { CUSTOMIZATION_STATUSES, isCustomizationTransitionAllowed } from "@/server/customization/workflow";

export const CUSTOMIZATION_NOTE_MAX = 2000;

export interface AdminCustomizationListItem {
  id: string;
  status: CustomizationStatus;
  details: string;
  customerName: string;
  customerEmail?: string;
  orderId?: string;
  orderNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomizationDetail extends AdminCustomizationListItem {
  customerPhone?: string;
  productId?: string;
  orderItemId?: string;
  activities: Array<Pick<CustomizationActivity, "type" | "fromStatus" | "toStatus" | "createdAt"> & { actorName: string }>;
  notes: Array<{ authorName: string; body: string; createdAt: string }>;
}

async function requireRead() {
  const session = await requireAdminSession();
  const auth = await authorizeAdmin("orders.read");
  if (!auth.ok) throw new Error("Unauthorized.");
  return session;
}

export async function listAdminCustomizations(raw: { q?: string; status?: string }) {
  await requireRead();
  const q = (raw.q ?? "").trim().slice(0, 80).toLowerCase();
  const status = CUSTOMIZATION_STATUSES.includes(raw.status as CustomizationStatus) ? raw.status as CustomizationStatus : "";
  const rows = await getRepositories().customizationRequests.list();
  const users = await Promise.all(rows.map((row) => getRepositories().users.getById(row.userId)));
  const items = rows.map((row, index) => ({ row, user: users[index] })).filter(({ row, user }) =>
    (!status || row.status === status) && (!q || [row.id, row.details, user?.name, user?.email].some((value) => value?.toLowerCase().includes(q))),
  ).sort((a, b) => b.row.createdAt.localeCompare(a.row.createdAt));
  return { items: items.map(({ row, user }) => ({ id: row.id, status: row.status, details: row.details, customerName: user?.name ?? "Unknown customer", ...(user?.email ? { customerEmail: user.email } : {}), ...(row.orderId ? { orderId: row.orderId } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt })), q, status };
}

export async function getAdminCustomization(id: string): Promise<AdminCustomizationDetail | null> {
  await requireRead();
  const request = await getRepositories().customizationRequests.getById(id);
  if (!request) return null;
  const user = await getRepositories().users.getById(request.userId);
  const order = request.orderId ? await getRepositories().orders.getById(request.orderId) : null;
  const [activities, notes] = await Promise.all([
    getRepositories().customizationActivities.listByRequestId(id),
    getRepositories().customizationNotes.listByRequestId(id),
  ]);
  return { id: request.id, status: request.status, details: request.details, customerName: user?.name ?? "Unknown customer", ...(user?.email ? { customerEmail: user.email } : {}), ...(user?.phone ? { customerPhone: user.phone } : {}), ...(request.productId ? { productId: request.productId } : {}), ...(request.orderId ? { orderId: request.orderId } : {}), ...(order?.orderNumber ? { orderNumber: order.orderNumber } : {}), ...(request.orderItemId ? { orderItemId: request.orderItemId } : {}), createdAt: request.createdAt, updatedAt: request.updatedAt, activities: activities.map((item) => ({ type: item.type, ...(item.fromStatus ? { fromStatus: item.fromStatus } : {}), ...(item.toStatus ? { toStatus: item.toStatus } : {}), actorName: item.actorUserId ?? "System", createdAt: item.createdAt })), notes: notes.map((note) => ({ authorName: note.authorName, body: note.body, createdAt: note.createdAt })) };
}

export type CustomizationMutationResult = { ok: true; status?: CustomizationStatus } | { ok: false; error: string };

export async function transitionCustomization(id: string, next: string): Promise<CustomizationMutationResult> {
  const auth = await authorizeAdmin("orders.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!CUSTOMIZATION_STATUSES.includes(next as CustomizationStatus)) return { ok: false, error: "Invalid request status." };
  try {
    await getRepositories().transaction(async (tx) => {
      const request = await tx.customizationRequests.getById(id);
      if (!request || !isCustomizationTransitionAllowed(request.status, next as CustomizationStatus)) throw new Error("That status transition is not allowed.");
      const now = new Date().toISOString();
      const updated = await tx.customizationRequests.transitionStatus(id, request.status, next as CustomizationStatus, now);
      if (!updated) throw new Error("This request changed. Refresh and try again.");
      const event = next === "approved" ? "request_approved" : next === "rejected" ? "request_rejected" : next === "completed" ? "request_completed" : "status_changed";
      await tx.customizationActivities.create({ id: randomUUID(), customizationRequestId: id, type: event, actorUserId: auth.session.sub === "dev-admin" ? undefined : auth.session.sub, fromStatus: request.status, toStatus: next as CustomizationStatus, createdAt: now });
    });
    return { ok: true, status: next as CustomizationStatus };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not update the request." }; }
}

export async function addCustomizationNote(id: string, body: string): Promise<CustomizationMutationResult> {
  const auth = await authorizeAdmin("orders.write");
  if (!auth.ok) return { ok: false, error: auth.error };
  const clean = body.trim();
  if (!clean || clean.length > CUSTOMIZATION_NOTE_MAX) return { ok: false, error: `Notes must be 1-${CUSTOMIZATION_NOTE_MAX} characters.` };
  try {
    await getRepositories().transaction(async (tx) => {
      const request = await tx.customizationRequests.getById(id);
      if (!request) throw new Error("Request not found.");
      const now = new Date().toISOString();
      await tx.customizationNotes.create({ id: randomUUID(), customizationRequestId: id, authorUserId: auth.session.sub === "dev-admin" ? undefined : auth.session.sub, authorName: "Studio admin", body: clean, createdAt: now });
      await tx.customizationActivities.create({ id: randomUUID(), customizationRequestId: id, type: "internal_note_added", createdAt: now });
    });
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save the note." }; }
}
