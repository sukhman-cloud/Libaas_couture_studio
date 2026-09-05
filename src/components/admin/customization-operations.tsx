"use client";

import { useActionState, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  addCustomizationNoteAction,
  changeCustomizationStatusAction,
  type CustomizationAdminActionState,
} from "@/lib/customization/admin-actions";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";
import type { CustomizationStatus } from "@/types/domain";

/** Confirmation is required before a terminal/negative transition. */
const CONFIRM_STATUSES = new Set<CustomizationStatus>(["rejected", "cancelled"]);

export function CustomizationOperations({
  requestId,
  nextStatuses,
}: {
  requestId: string;
  nextStatuses: CustomizationStatus[];
}) {
  const [status, statusAction, statusPending] = useActionState<
    CustomizationAdminActionState,
    FormData
  >(changeCustomizationStatusAction, {});
  const [note, noteAction, notePending] = useActionState<
    CustomizationAdminActionState,
    FormData
  >(addCustomizationNoteAction, {});
  const formRefs = useRef<Partial<Record<CustomizationStatus, HTMLFormElement>>>({});
  const [confirmTarget, setConfirmTarget] = useState<CustomizationStatus | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Update request</h2>
        {nextStatuses.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextStatuses.map((next) => (
              <form
                key={next}
                ref={(el) => {
                  if (el) formRefs.current[next] = el;
                }}
                action={statusAction}
                onSubmit={(event) => {
                  if (CONFIRM_STATUSES.has(next)) {
                    event.preventDefault();
                    setConfirmTarget(next);
                  }
                }}
              >
                <input type="hidden" name="requestId" value={requestId} />
                <input type="hidden" name="nextStatus" value={next} />
                <button
                  type="submit"
                  disabled={statusPending}
                  className={buttonStyles({
                    size: "sm",
                    variant: CONFIRM_STATUSES.has(next) ? "outline" : "primary",
                  })}
                >
                  {statusPending ? "Saving..." : `Mark ${CUSTOMIZATION_STATUS_LABELS[next]}`}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No further status changes are available.</p>
        )}
        {status.success && (
          <p className="mt-3 text-sm text-success" role="status">
            {status.success}
          </p>
        )}
        {status.error && <p className="mt-3 text-sm text-danger">{status.error}</p>}

        <ConfirmationDialog
          open={confirmTarget !== null}
          onClose={() => setConfirmTarget(null)}
          onConfirm={() => {
            const target = confirmTarget;
            setConfirmTarget(null);
            if (target) formRefs.current[target]?.requestSubmit();
          }}
          title={
            confirmTarget
              ? `Mark this request "${CUSTOMIZATION_STATUS_LABELS[confirmTarget]}"?`
              : ""
          }
          description="The customer will be notified. This cannot be undone from here."
          confirmLabel="Confirm"
          destructive
          isConfirming={statusPending}
        />
      </section>

      <section className="rounded-2xl border border-cream-200 bg-surface p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-navy-800">Internal note</h2>
        <form action={noteAction} className="mt-3 space-y-3">
          <input type="hidden" name="requestId" value={requestId} />
          <Textarea
            name="body"
            required
            maxLength={2000}
            placeholder="Add a private studio note"
            aria-label="Internal customization note"
          />
          <button type="submit" disabled={notePending} className={buttonStyles({ size: "sm" })}>
            {notePending ? "Saving..." : "Add note"}
          </button>
        </form>
        {note.success && (
          <p className="mt-3 text-sm text-success" role="status">
            {note.success}
          </p>
        )}
        {note.error && <p className="mt-3 text-sm text-danger">{note.error}</p>}
      </section>
    </div>
  );
}
