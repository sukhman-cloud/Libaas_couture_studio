"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "left" | "right";
  /** "dark" renders the navy admin styling. */
  tone?: "light" | "dark";
  children?: ReactNode;
  className?: string;
}

/**
 * Slide-over panel on the native <dialog> element (focus trap, Escape and
 * inert background come from the platform). Used for mobile navigation,
 * filters, etc.
 *
 * IMPORTANT: never add a display utility (flex/grid/…) to the <dialog>
 * itself — it would override the UA's `dialog:not([open]) { display: none }`
 * and make the closed drawer visible. Layout lives on the inner wrapper.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  tone = "light",
  children,
  className,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dark = tone === "dark";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Resync React state if the dialog closes natively
        // (e.g. a child <form method="dialog">).
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className={cn(
        "fixed inset-y-0 m-0 h-dvh max-h-dvh w-80 max-w-[85vw] p-0 shadow-2xl backdrop:bg-navy-950/60 backdrop:backdrop-blur-sm",
        dark ? "bg-navy-900 text-cream-50" : "bg-surface",
        side === "right" ? "ml-auto mr-0" : "ml-0 mr-auto",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <div
          className={cn(
            "flex items-center justify-between gap-4 border-b px-5 py-4",
            dark ? "border-navy-800" : "border-cream-200",
          )}
        >
          <Heading level={3} className={cn("text-lg", dark && "text-cream-50")}>
            {title}
          </Heading>
          <IconButton
            label="Close"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className={cn(
              dark && "text-cream-100 hover:bg-navy-800 active:bg-navy-700",
            )}
          >
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
