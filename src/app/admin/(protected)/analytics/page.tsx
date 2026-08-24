import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Analytics" };

export default function AdminAnalyticsPage() {
  return (
    <AdminSectionPlaceholder
      icon={BarChart3}
      title="Analytics"
      phase="a later phase"
      description="Sales, order and customer insights will appear here once live data exists."
    />
  );
}
