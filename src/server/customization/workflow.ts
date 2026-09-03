import type { CustomizationStatus } from "@/types/domain";

export const CUSTOMIZATION_STATUSES: readonly CustomizationStatus[] = [
  "pending", "reviewing", "approved", "in_progress", "completed", "rejected", "cancelled",
];

export const CUSTOMIZATION_STATUS_LABELS: Record<CustomizationStatus, string> = {
  pending: "Pending", reviewing: "Reviewing", draft: "Draft", quoted: "Quoted",
  approved: "Approved", in_progress: "In progress", completed: "Completed",
  rejected: "Rejected", cancelled: "Cancelled",
};

const transitions: Record<CustomizationStatus, readonly CustomizationStatus[]> = {
  pending: ["reviewing", "rejected", "cancelled"],
  reviewing: ["approved", "in_progress", "rejected"],
  approved: ["in_progress", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [], rejected: [], cancelled: [],
  draft: ["reviewing", "cancelled"], quoted: ["approved", "rejected"],
};

export function nextCustomizationStatuses(status: CustomizationStatus): CustomizationStatus[] {
  return [...transitions[status]];
}

export function isCustomizationTransitionAllowed(current: CustomizationStatus, next: CustomizationStatus) {
  return transitions[current].includes(next);
}
