import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Orders" };

export default function AdminOrdersPage() {
  return (
    <AdminSectionPlaceholder
      icon={ShoppingBag}
      title="Orders"
      phase="a later phase"
      description="Order list, statuses and the stitching workflow (placed → paid → stitching → QC → ready → delivered) will be managed here."
    />
  );
}
