import type { Metadata } from "next";

/**
 * Applies to every route under /admin (login and the protected shell
 * alike): admin pages are operational tooling, never meant to be indexed
 * or followed by a search engine, regardless of whether robots.txt is
 * also configured to disallow the path.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
