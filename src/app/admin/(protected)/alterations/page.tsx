import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Alterations" };

export default function AdminAlterationsPage() {
  return (
    <AdminSectionPlaceholder
      icon={ClipboardList}
      title="Alterations"
      phase="a later phase"
      description="Alteration intake, due dates and ready-for-pickup tracking will be managed here."
    />
  );
}
