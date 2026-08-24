import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Guarded admin shell. The middleware already redirects requests without a
 * session cookie; this layout is the real gate — it cryptographically
 * verifies the session on the server for every admin page.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-dvh bg-cream-100">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-navy-700 focus:px-5 focus:py-2.5 focus:text-sm focus:text-cream-50"
      >
        Skip to content
      </a>
      <AdminSidebar />
      <div className="lg:pl-64">
        <AdminTopbar />
        <main
          id="admin-main"
          tabIndex={-1}
          className="mx-auto max-w-7xl p-4 focus:outline-none sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
