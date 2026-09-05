"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible tabs — tablist/tab/tabpanel roles with arrow-key navigation
 * (roving tabindex).
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  idBase: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const idBase = useId();
  return (
    <TabsContext.Provider value={{ value, setValue, idBase }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({
  label,
  children,
  className,
}: {
  /** Accessible name for the tab list. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
          return;
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>("[role='tab']"),
        );
        const current = tabs.indexOf(document.activeElement as HTMLElement);
        if (current === -1) return;
        event.preventDefault();
        let next = current;
        if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
        if (event.key === "ArrowLeft")
          next = (current - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        tabs[next].focus();
        tabs[next].click();
      }}
      className={cn(
        "flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-cream-200 bg-cream-100 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Tab({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active, setValue, idBase } = useTabs();
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${idBase}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${idBase}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(value)}
      className={cn(
        "min-h-11 whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition-colors",
        selected
          ? "bg-navy-700 text-cream-50 shadow-sm"
          : "text-navy-700 hover:bg-navy-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active, idBase } = useTabs();
  const selected = active === value;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      hidden={!selected}
      tabIndex={0}
      className={cn("mt-4 focus:outline-none", className)}
    >
      {selected && children}
    </div>
  );
}
