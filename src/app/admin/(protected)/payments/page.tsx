import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Payments" };

export default function AdminPaymentsPage() {
  return (
    <AdminSectionPlaceholder
      icon={CreditCard}
      title="Payments"
      phase="a later phase"
      description="Payment records, methods and reconciliation will be managed here."
    />
  );
}
