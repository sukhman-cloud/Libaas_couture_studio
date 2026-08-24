import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Audit Logs" };

export default function AdminAuditLogsPage() {
  return (
    <AdminSectionPlaceholder
      icon={ScrollText}
      title="Audit Logs"
      phase="a later phase"
      description="A trace of who changed what, and when, will be recorded here."
    />
  );
}
