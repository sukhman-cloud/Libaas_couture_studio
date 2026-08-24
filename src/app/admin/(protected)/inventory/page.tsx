import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Inventory" };

export default function AdminInventoryPage() {
  return (
    <AdminSectionPlaceholder
      icon={Boxes}
      title="Inventory"
      phase="a later phase"
      description="Stock levels, low-stock alerts and fabric/material tracking will be managed here."
    />
  );
}
