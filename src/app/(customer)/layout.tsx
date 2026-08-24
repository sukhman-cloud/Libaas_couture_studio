import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getCartCount, getWishlistCount } from "@/server/commerce/service";

/**
 * Counts come from the customer's own records, so the header renders per
 * request for signed-in visitors. They are zero (and nothing is fetched)
 * for anonymous visitors.
 */
export default async function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCustomerUser();
  const [cartCount, wishlistCount] = user
    ? await Promise.all([getCartCount(user.id), getWishlistCount(user.id)])
    : [0, 0];

  return (
    // Bottom padding on the wrapper (not <main>) keeps BOTH the content and
    // the footer clear of the fixed mobile bottom nav, including the
    // safe-area inset on notched phones.
    <div className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-navy-700 focus:px-5 focus:py-2.5 focus:text-sm focus:text-cream-50"
      >
        Skip to content
      </a>
      <SiteHeader cartCount={cartCount} wishlistCount={wishlistCount} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
      <BottomNav cartCount={cartCount} wishlistCount={wishlistCount} />
    </div>
  );
}
