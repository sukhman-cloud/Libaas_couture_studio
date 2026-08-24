"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { SearchInput } from "@/components/ui/search-input";
import {
  customerActionNav,
  customerPrimaryNav,
  type NavItem,
} from "@/config/nav";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3"
      aria-label={`${siteConfig.name} — home`}
    >
      <Image
        src={siteConfig.assets.logo}
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-full ring-1 ring-gold-500/50"
        priority
      />
      <span className="leading-tight">
        <span className="block font-display text-xl font-semibold italic text-navy-800">
          {siteConfig.shortName}
        </span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.35em] text-gold-600">
          Couture Studio
        </span>
      </span>
    </Link>
  );
}

export function SiteHeader({
  cartCount = 0,
  wishlistCount = 0,
}: {
  /** Total quantity in the signed-in customer's bag. */
  cartCount?: number;
  /** Number of wishlisted products. */
  wishlistCount?: number;
} = {}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const countFor = (href: string) =>
    href === "/cart" ? cartCount : href === "/wishlist" ? wishlistCount : 0;

  // Close the drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-50/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Brand />

        {/* Desktop: primary nav */}
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {customerPrimaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item) ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    isActive(pathname, item)
                      ? "bg-navy-700 text-cream-50"
                      : "text-navy-700 hover:bg-navy-50",
                  )}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop: search */}
        <form
          action="/search"
          role="search"
          className="hidden max-w-xs flex-1 md:block"
        >
          <SearchInput
            name="q"
            placeholder="Search the studio…"
            aria-label="Search the studio"
          />
        </form>

        <div className="flex items-center gap-1">
          {/* Mobile: search shortcut */}
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex size-11 items-center justify-center rounded-full text-navy-700 transition-colors hover:bg-navy-50 md:hidden"
          >
            <Search className="size-5" aria-hidden />
          </Link>

          {/* Desktop: personal shortcuts */}
          <ul className="hidden items-center gap-1 md:flex">
            {customerActionNav.map((item) => {
              const count = countFor(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // The count is part of the accessible name, never
                    // conveyed by the badge alone.
                    aria-label={
                      count > 0 ? `${item.title} (${count})` : item.title
                    }
                    aria-current={isActive(pathname, item) ? "page" : undefined}
                    title={item.title}
                    className={cn(
                      "relative inline-flex size-11 items-center justify-center rounded-full transition-colors",
                      isActive(pathname, item)
                        ? "bg-navy-700 text-cream-50"
                        : "text-navy-700 hover:bg-navy-50",
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                    {count > 0 && (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-gold-500 px-1 text-center text-[11px] font-medium leading-5 text-navy-900"
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Mobile: menu drawer trigger */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="inline-flex size-11 items-center justify-center rounded-full text-navy-700 transition-colors hover:bg-navy-50 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile/tablet navigation drawer */}
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        side="right"
      >
        <nav aria-label="Primary mobile">
          <ul className="flex flex-col gap-1">
            {[...customerPrimaryNav, ...customerActionNav].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item) ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-base transition-colors",
                    isActive(pathname, item)
                      ? "bg-navy-700 text-cream-50"
                      : "text-navy-700 hover:bg-navy-50",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-6 border-t border-cream-200 pt-4 text-xs text-muted">
          {siteConfig.tagline}
        </p>
      </Drawer>
    </header>
  );
}
