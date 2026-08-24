"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Footer slot — typically action buttons. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal on the native <dialog> element: focus trapping, Escape-to-close
 * and inert background come from the platform.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Lock background scroll while open.
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
        // A click on the <dialog> itself (not its children) is the backdrop.
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-lg rounded-2xl bg-surface p-0 shadow-2xl backdrop:bg-navy-950/60 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4 sm:px-6">
        <div>
          <Heading level={3} className="text-lg sm:text-xl">
            {title}
          </Heading>
          {description && (
            <p className="mt-1 text-sm text-muted">{description}</p>
          )}
        </div>
        <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>

      {children && <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>}

      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-cream-200 px-5 py-4 sm:px-6">
          {footer}
        </div>
      )}
    </dialog>
  );
}
