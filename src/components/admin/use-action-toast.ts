"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

/** The common shape of every admin mutation's useActionState result
 *  (OrderActionState, InventoryActionState, etc.) — structural, not a
 *  shared type import, so this works across the small differences between
 *  them without coupling this file to any one action module. */
interface ToastableActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Fire a toast the first time a NEW action-state object appears.
 * Order/shipping/payment/inventory operations all keep their existing
 * persistent inline text too — the toast is a transient notification on
 * top of it, not a replacement, so a result is visible whether or not the
 * admin is looking at this exact card when it lands.
 */
export function useActionToast<T extends ToastableActionState>(state: T) {
  const { toast } = useToast();
  const last = useRef<T | null>(null);
  useEffect(() => {
    if (last.current === state) return;
    last.current = state;
    if (state.message) toast({ title: state.message, tone: "success" });
    else if (!state.ok && state.error) toast({ title: state.error, tone: "danger" });
  }, [state, toast]);
}
