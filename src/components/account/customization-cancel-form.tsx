"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cancelCustomizationAction, type CustomizationActionState } from "@/lib/customization/actions";

export function CustomizationCancelForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<CustomizationActionState, FormData>(cancelCustomizationAction, {});
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Cancel this customization request?")) event.preventDefault(); }}><input type="hidden" name="requestId" value={requestId} /><button type="submit" disabled={pending} className={buttonStyles({ variant: "outline", size: "sm" })}>{pending ? "Cancelling..." : "Cancel request"}</button>{state.success && <p className="mt-2 text-sm text-success" role="status">{state.success}</p>}{state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}</form>;
}
