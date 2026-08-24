import type { Metadata } from "next";
import { Ruler } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Custom Orders" };

export default function AdminCustomOrdersPage() {
  return (
    <AdminSectionPlaceholder
      icon={Ruler}
      title="Custom Orders"
      phase="a later phase"
      description="Customer reference designs, measurement-linked custom orders and their production journey will be managed here."
    />
  );
}
