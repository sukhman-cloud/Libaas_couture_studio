import type { Metadata } from "next";
import { Scissors } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Stitching" };

export default function AdminStitchingPage() {
  return (
    <AdminSectionPlaceholder
      icon={Scissors}
      title="Stitching"
      phase="a later phase"
      description="The stitching workflow board — custom orders, quotes, production stages and quality checks — will live here."
    />
  );
}
