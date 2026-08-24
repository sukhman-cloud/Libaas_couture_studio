"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Ruler,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Overview", href: "/account", icon: LayoutDashboard, exact: true },
  { title: "Profile", href: "/account/profile", icon: UserRound },
  { title: "Addresses", href: "/account/addresses", icon: MapPin },
  { title: "Measurements", href: "/account/measurements", icon: Ruler },
  { title: "Settings", href: "/account/settings", icon: Settings },
];

/**
 * Account section navigation — horizontal scrollable pills on mobile,
 * vertical rail on ≥ lg.
 */
export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition-colors lg:rounded-xl",
                  active
                    ? "bg-navy-700 text-cream-50"
                    : "text-navy-700 hover:bg-navy-50",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
