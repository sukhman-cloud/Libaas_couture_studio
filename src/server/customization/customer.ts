import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import type { CustomizationRequest } from "@/types/domain";
import { isCustomizationTransitionAllowed } from "@/server/customization/workflow";

const REQUEST_ID = /^[a-f0-9-]{36}$/i;

export interface CustomerCustomizationView {
  id: string;
  status: CustomizationRequest["status"];
  details: string;
  productId?: string;
  hasOrderContext: boolean;
  createdAt: string;
  updatedAt: string;
  activities?: Array<{ type: string; fromStatus?: string; toStatus?: string; createdAt: string }>;
}

const view = (request: CustomizationRequest): CustomerCustomizationView => ({
  id: request.id,
  status: request.status,
  details: request.details,
  ...(request.productId ? { productId: request.productId } : {}),
  hasOrderContext: Boolean(request.orderId && request.orderItemId),
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

export async function listOwnCustomizationRequests(userId: string) {
  const rows = await getRepositories().customizationRequests.list();
  return rows.filter((row) => row.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view);
}

export async function getOwnCustomizationRequest(userId: string, id: string) {
  if (!REQUEST_ID.test(id)) return null;
  const request = await getRepositories().customizationRequests.getById(id);
  if (!request || request.userId !== userId) return null;
  const activities = await getRepositories().customizationActivities.listByRequestId(id);
  return {
    ...view(request),
    activities: activities.map((activity) => ({
      type: activity.type,
      ...(activity.fromStatus ? { fromStatus: activity.fromStatus } : {}),
      ...(activity.toStatus ? { toStatus: activity.toStatus } : {}),
      createdAt: activity.createdAt,
    })),
  };
}

export async function cancelOwnCustomizationRequest(userId: string, id: string) {
  if (!REQUEST_ID.test(id)) return { ok: false as const, error: "Request not found." };
  try {
    const result = await getRepositories().transaction(async (tx) => {
      const request = await tx.customizationRequests.getById(id);
      if (!request || request.userId !== userId) throw new Error("Request not found.");
      if (!isCustomizationTransitionAllowed(request.status, "cancelled")) {
        throw new Error("This request can no longer be cancelled.");
      }
      const now = new Date().toISOString();
      const updated = await tx.customizationRequests.transitionStatus(id, request.status, "cancelled", now);
      if (!updated) throw new Error("This request changed. Refresh and try again.");
      await tx.customizationActivities.create({ id: randomUUID(), customizationRequestId: id, type: "customer_cancelled", fromStatus: request.status, toStatus: "cancelled", createdAt: now });
      return updated;
    });
    return { ok: true as const, request: view(result) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not cancel the request." };
  }
}
