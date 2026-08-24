import type { Metadata } from "next";
import { Star } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Reviews" };

export default function AdminReviewsPage() {
  return (
    <AdminSectionPlaceholder
      icon={Star}
      title="Reviews"
      phase="a later phase"
      description="Customer reviews and approval moderation will be managed here."
    />
  );
}
