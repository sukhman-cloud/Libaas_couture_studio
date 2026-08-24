"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

/**
 * Mobile filter entry point. Reuses the Phase 2 Drawer (native <dialog>),
 * so Escape, the overlay click, focus trapping and body-scroll locking all
 * come from the already-verified implementation.
 *
 * The form inside is a plain GET form: submitting it is a real navigation,
 * which unmounts the drawer — no extra close handling needed.
 */
export function MobileFilterDrawer({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-navy-700 px-2 py-0.5 text-xs text-cream-50">
            {activeCount}
          </span>
        )}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={activeCount > 0 ? `Filters (${activeCount})` : "Filters"}
        side="right"
      >
        {children}
      </Drawer>
    </>
  );
}
