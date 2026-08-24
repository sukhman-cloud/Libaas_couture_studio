"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { adminNavGroups } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

function NavGroups({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {adminNavGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-400/80">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-gold-500 font-medium text-navy-900"
                        : "text-cream-100/80 hover:bg-navy-800 hover:text-cream-50",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Admin navigation:
 * - Desktop (≥ lg): fixed sidebar with grouped sections.
 * - Mobile/tablet: top bar plus the shared <Drawer> (native <dialog> —
 *   Escape, focus trap and scroll lock come from the platform).
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fallback for programmatic navigation (back/forward).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const brand = (
    <Link href="/admin" className="flex items-center gap-3 px-3">
      <Image
        src={siteConfig.assets.logo}
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-full ring-1 ring-gold-500/50"
      />
      <span className="leading-tight">
        <span className="block font-display text-lg font-semibold italic text-cream-50">
          {siteConfig.shortName}
        </span>
        <span className="block text-[9px] font-medium uppercase tracking-[0.3em] text-gold-400">
          Admin
        </span>
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 overflow-y-auto bg-navy-900 py-6 lg:flex">
        {brand}
        <nav aria-label="Admin" className="flex-1 px-3">
          <NavGroups pathname={pathname} />
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between bg-navy-900 px-2 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin menu"
          className="inline-flex size-11 items-center justify-center rounded-full text-cream-50 transition-colors hover:bg-navy-800"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      {/* Mobile drawer — shared accessible Drawer, navy tone */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Admin menu"
        side="left"
        tone="dark"
        className="lg:hidden"
      >
        <nav aria-label="Admin mobile" className="-mx-2">
          <NavGroups
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        </nav>
      </Drawer>
    </>
  );
}
