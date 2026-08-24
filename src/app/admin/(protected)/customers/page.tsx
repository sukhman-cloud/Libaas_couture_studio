import type { Metadata } from "next";
import { Users } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Customers" };

export default function AdminCustomersPage() {
  return (
    <AdminSectionPlaceholder
      icon={Users}
      title="Customers"
      phase="a later phase"
      description="Customer profiles, measurement profiles and order history will be managed here."
    />
  );
}
