"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { customerBottomNav } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Mobile-only bottom navigation — thumb-friendly primary actions.
 * Hidden on ≥ md screens where the header nav takes over.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {customerBottomNav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "text-navy-800" : "text-muted",
                )}
              >
                <item.icon
                  className={cn("size-5", active && "text-gold-600")}
                  aria-hidden
                />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
