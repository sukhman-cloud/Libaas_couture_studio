import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const hasAddress = Boolean(siteConfig.address.line1);
  const hasPhone = Boolean(siteConfig.contact.phone);

  return (
    <footer className="border-t border-navy-800 bg-navy-900 text-cream-100">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="font-display text-2xl font-semibold italic">
            {siteConfig.shortName}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-gold-400">
            Couture Studio
          </p>
          <p className="mt-4 max-w-xs text-sm text-cream-100/70">
            {siteConfig.tagline}
          </p>
        </div>

        <nav aria-label="Footer" className="text-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            Explore
          </h4>
          <ul className="space-y-2">
            <li><Link className="hover:text-gold-300" href="/shop">Shop</Link></li>
            <li><Link className="hover:text-gold-300" href="/collections">Collections</Link></li>
            <li><Link className="hover:text-gold-300" href="/search">Search</Link></li>
            <li><Link className="hover:text-gold-300" href="/wishlist">Wishlist</Link></li>
            <li><Link className="hover:text-gold-300" href="/cart">Cart</Link></li>
            <li><Link className="hover:text-gold-300" href="/account">Account</Link></li>
          </ul>
        </nav>

        <div className="text-sm">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            Visit
          </h4>
          <address className="space-y-2 not-italic text-cream-100/80">
            <p>
              {hasAddress ? siteConfig.address.line1 : null}
              {hasAddress ? <br /> : null}
              {siteConfig.address.line2}, {siteConfig.address.city},{" "}
              {siteConfig.address.state}
            </p>
            {hasPhone && <p>{siteConfig.contact.phone}</p>}
            <p className="flex gap-4 pt-1">
              <a
                className="hover:text-gold-300"
                href={siteConfig.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
              <a
                className="hover:text-gold-300"
                href={siteConfig.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook
              </a>
            </p>
          </address>
        </div>
      </div>

      <div className="border-t border-navy-800">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-cream-100/60 sm:flex-row">
          <p>© {year} {siteConfig.name}</p>
          <p>Crafted in Punjab</p>
        </div>
      </div>
    </footer>
  );
}
