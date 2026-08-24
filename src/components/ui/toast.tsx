"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toast system: <ToastProvider> near the root, useToast() anywhere below.
 * Announced politely to screen readers; dismissible; auto-expires.
 */

type ToastTone = "info" | "success" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

interface ToastRecord extends Required<Omit<ToastOptions, "description">> {
  id: number;
  description?: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const toneConfig: Record<ToastTone, { icon: typeof Info; accent: string }> = {
  info: { icon: Info, accent: "text-navy-500" },
  success: { icon: CheckCircle2, accent: "text-success" },
  danger: { icon: XCircle, accent: "text-danger" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);

  // Keep the toast region in the browser top layer (Popover API) so toasts
  // stay visible and clickable above open <dialog> modals/drawers. Falls
  // back gracefully where the API is unavailable.
  useEffect(() => {
    const el = regionRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      const isOpen = el.matches(":popover-open");
      if (toasts.length > 0 && !isOpen) el.showPopover();
      else if (toasts.length === 0 && isOpen) el.hidePopover();
    } catch {
      // Older browsers: the region renders as a normal fixed element.
    }
  }, [toasts.length]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, tone = "info", duration = 5000 }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current,
        { id, title, description, tone, duration },
      ]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Announcement region — bottom-centre on mobile, bottom-right once the
          bottom nav disappears (md). popover="manual" promotes it to the top
          layer; no display utility on this element (the UA hides a closed
          popover with display:none). UA popover styles are neutralised
          (m-0/border-0/bg-transparent/top-auto/w-auto). */}
      <div
        ref={regionRef}
        popover="manual"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 top-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-60 m-0 w-auto overflow-visible border-0 bg-transparent p-0 md:inset-x-auto md:right-6 md:bottom-6"
      >
        <div className="flex flex-col items-center gap-2 md:items-end">
        {toasts.map((t) => {
          const { icon: Icon, accent } = toneConfig[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-cream-200 bg-surface px-4 py-3 shadow-lg"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", accent)} aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-ink">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-muted">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded-full p-1 text-muted transition-colors hover:bg-cream-100 hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
