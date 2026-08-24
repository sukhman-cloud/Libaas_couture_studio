import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Settings" };

export default function AdminSettingsPage() {
  return (
    <AdminSectionPlaceholder
      icon={Settings}
      title="Settings"
      phase="a later phase"
      description="Business details (address, hours, contact), staff, roles and permissions will be configured here."
    />
  );
}
