"use client";

import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { adminNavItems } from "@/config/nav";
import { logoutAdmin } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

function breadcrumbsFor(pathname: string): BreadcrumbItem[] {
  if (pathname === "/admin") return [{ title: "Dashboard" }];
  const current = adminNavItems.find(
    (item) =>
      item.href !== "/admin" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  const items: BreadcrumbItem[] = [{ title: "Dashboard", href: "/admin" }];
  if (current) items.push({ title: current.title });
  return items;
}

const triggerClasses =
  "inline-flex size-11 items-center justify-center rounded-full text-navy-700 transition-colors hover:bg-navy-50";

/** Admin top bar: breadcrumbs + notifications + profile menu. */
export function AdminTopbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-14 z-30 border-b border-cream-200 bg-cream-50/85 backdrop-blur-md lg:top-0">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <Breadcrumb items={breadcrumbsFor(pathname)} className="min-w-0" />

        <div className="flex items-center gap-1">
          {/* Notifications — disclosure panel, not a menu */}
          <Dropdown>
            <DropdownTrigger className={triggerClasses} aria-label="Notifications">
              <Bell className="size-5" aria-hidden />
            </DropdownTrigger>
            <DropdownMenu label="Notifications" role="none" className="w-72">
              <DropdownLabel>Notifications</DropdownLabel>
              <p className="px-4 pb-3 pt-1 text-sm text-muted">
                No notifications yet. Order and appointment alerts will appear
                here once those modules are live.
              </p>
            </DropdownMenu>
          </Dropdown>

          {/* Profile */}
          <Dropdown>
            <DropdownTrigger
              className={cn(triggerClasses, "hover:opacity-85")}
              aria-label="Admin account menu"
              aria-haspopup="menu"
            >
              <Avatar name="Studio Admin" size="sm" />
            </DropdownTrigger>
            <DropdownMenu label="Admin account">
              <DropdownLabel>Signed in as Studio Admin</DropdownLabel>
              <DropdownSeparator />
              <DropdownItem
                onSelect={() => {
                  void logoutAdmin();
                }}
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
