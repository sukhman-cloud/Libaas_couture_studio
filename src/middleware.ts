import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
} from "@/lib/auth/constants";

/**
 * Edge guards for protected areas.
 *
 * These are fast presence checks only (good UX: instant redirect).
 * Cryptographic session verification happens server-side in the admin
 * (protected) layout and the customer account layout — the middleware is
 * never the sole defence.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin area (except its login page)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!request.cookies.has(ADMIN_SESSION_COOKIE)) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Customer account area
  if (pathname.startsWith("/account")) {
    if (!request.cookies.has(CUSTOMER_SESSION_COOKIE)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
