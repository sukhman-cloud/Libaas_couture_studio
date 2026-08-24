"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible dropdown (no library):
 * - Escape closes and restores trigger focus — wherever focus currently is
 * - Tab closes and lets focus continue from the trigger
 * - Arrow keys / Home / End rove between menu items
 * - Outside click closes; item activation restores trigger focus
 * - `role="none"` panel mode for non-menu content (e.g. notifications)
 */

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: (restoreFocus: boolean) => void;
  menuId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error("Dropdown components must be used inside <Dropdown>");
  return ctx;
}

export function Dropdown({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((restoreFocus: boolean) => {
    if (restoreFocus) triggerRef.current?.focus();
    setOpen(false);
  }, []);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <DropdownContext.Provider
      value={{ open, setOpen, close, menuId, triggerRef }}
    >
      <div
        ref={rootRef}
        className="relative inline-flex"
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "Escape") {
            // Works whether focus sits on the trigger or inside the menu.
            event.preventDefault();
            close(true);
          } else if (event.key === "Tab") {
            // Refocus the trigger BEFORE the default Tab action runs, so
            // sequential focus continues from the trigger instead of being
            // dropped to <body> when the menu unmounts.
            close(true);
          }
        }}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Set for menu-style content; omit for plain disclosure panels. */
  "aria-haspopup"?: ButtonHTMLAttributes<HTMLButtonElement>["aria-haspopup"];
}) {
  const { open, setOpen, menuId, triggerRef } = useDropdown();
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !open) {
          event.preventDefault();
          setOpen(true);
        }
      }}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenu({
  children,
  align = "end",
  className,
  label,
  role = "menu",
}: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  /** Accessible name for the panel. */
  label: string;
  /** "menu" for menuitem lists; "none" for plain disclosure panels. */
  role?: "menu" | "none";
}) {
  const { open, menuId } = useDropdown();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMenu = role === "menu";

  const focusItem = useCallback((direction: "first" | "last" | 1 | -1) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])"),
    );
    if (!items.length) return;
    if (direction === "first") return items[0].focus();
    if (direction === "last") return items[items.length - 1].focus();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = (current + direction + items.length) % items.length;
    items[next].focus();
  }, []);

  // Focus the first menu item when a menu opens.
  useEffect(() => {
    if (open && isMenu) focusItem("first");
  }, [open, isMenu, focusItem]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      id={menuId}
      role={isMenu ? "menu" : undefined}
      aria-label={label}
      onKeyDown={
        isMenu
          ? (event) => {
              switch (event.key) {
                case "ArrowDown":
                  event.preventDefault();
                  focusItem(1);
                  break;
                case "ArrowUp":
                  event.preventDefault();
                  focusItem(-1);
                  break;
                case "Home":
                  event.preventDefault();
                  focusItem("first");
                  break;
                case "End":
                  event.preventDefault();
                  focusItem("last");
                  break;
              }
            }
          : undefined
      }
      className={cn(
        "absolute top-full z-50 mt-2 min-w-52 overflow-hidden rounded-xl border border-cream-200 bg-surface py-1.5 shadow-lg",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

const itemClasses =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-cream-100 focus:bg-navy-50";

export function DropdownItem({
  children,
  href,
  onSelect,
  className,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onSelect?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const { close, setOpen } = useDropdown();

  if (href) {
    return (
      <Link
        href={href}
        role="menuitem"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className={cn(itemClasses, className)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        // Restore trigger focus so keyboard users keep their place.
        close(true);
        onSelect?.();
      }}
      className={cn(itemClasses, "disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-cream-200" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}
