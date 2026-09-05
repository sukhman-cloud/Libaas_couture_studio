import type { Metadata } from "next";
import { StaffManager } from "@/components/admin/staff-manager";
import { PageHeader } from "@/components/ui/page-header";
import { listAdminAccounts } from "@/server/staff/admin";

export const metadata: Metadata = { title: "Admin · Staff" };

export default async function AdminStaffPage() {
  const accounts = await listAdminAccounts();

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Everyone with access to this admin, and their role."
      />
      <StaffManager accounts={accounts} />
    </div>
  );
}
