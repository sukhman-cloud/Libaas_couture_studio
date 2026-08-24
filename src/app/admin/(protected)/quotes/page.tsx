import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Quotes" };

export default function AdminQuotesPage() {
  return (
    <AdminSectionPlaceholder
      icon={MessageSquareQuote}
      title="Quotes"
      phase="a later phase"
      description="Quotes for custom work — drafts, validity and customer approvals — will be managed here."
    />
  );
}
