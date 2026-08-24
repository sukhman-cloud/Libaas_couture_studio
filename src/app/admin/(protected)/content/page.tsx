import type { Metadata } from "next";
import { PenTool } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Content" };

export default function AdminContentPage() {
  return (
    <AdminSectionPlaceholder
      icon={PenTool}
      title="Content"
      phase="a later phase"
      description="Homepage sections, banners and studio storytelling will be managed here."
    />
  );
}
