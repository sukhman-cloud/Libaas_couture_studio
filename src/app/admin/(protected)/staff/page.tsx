import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Staff" };

export default function AdminStaffPage() {
  return (
    <AdminSectionPlaceholder
      icon={ShieldCheck}
      title="Staff"
      phase="a later phase"
      description="Staff accounts, roles and permissions will be managed here."
    />
  );
}
