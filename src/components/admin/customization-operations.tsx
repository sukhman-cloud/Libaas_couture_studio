"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addCustomizationNoteAction, changeCustomizationStatusAction, type CustomizationAdminActionState } from "@/lib/customization/admin-actions";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";
import type { CustomizationStatus } from "@/types/domain";

export function CustomizationOperations({ requestId, nextStatuses }: { requestId: string; nextStatuses: CustomizationStatus[] }) {
  const [status, statusAction, statusPending] = useActionState<CustomizationAdminActionState, FormData>(changeCustomizationStatusAction, {});
  const [note, noteAction, notePending] = useActionState<CustomizationAdminActionState, FormData>(addCustomizationNoteAction, {});
  return <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5"><h2 className="font-display text-lg font-medium text-navy-800">Update request</h2>{nextStatuses.length ? <div className="mt-3 flex flex-wrap gap-2">{nextStatuses.map((next) => <form key={next} action={statusAction}><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="nextStatus" value={next} /><button disabled={statusPending} className={buttonStyles({ size: "sm", variant: next === "rejected" ? "outline" : "primary" })}>{statusPending ? "Saving..." : `Mark ${CUSTOMIZATION_STATUS_LABELS[next]}`}</button></form>)}</div> : <p className="mt-2 text-sm text-muted">No further status changes are available.</p>}{status.success && <p className="mt-3 text-sm text-success" role="status">{status.success}</p>}{status.error && <p className="mt-3 text-sm text-danger">{status.error}</p>}</section><section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5"><h2 className="font-display text-lg font-medium text-navy-800">Internal note</h2><form action={noteAction} className="mt-3 space-y-3"><input type="hidden" name="requestId" value={requestId} /><Textarea name="body" required maxLength={2000} placeholder="Add a private studio note" aria-label="Internal customization note" /><button disabled={notePending} className={buttonStyles({ size: "sm" })}>{notePending ? "Saving..." : "Add note"}</button></form>{note.success && <p className="mt-3 text-sm text-success" role="status">{note.success}</p>}{note.error && <p className="mt-3 text-sm text-danger">{note.error}</p>}</section></div>;
}
