import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = { title: "Admin · Payments" };

export default function AdminPaymentsPage() {
  return (
    <AdminSectionPlaceholder
      icon={CreditCard}
      title="Payments"
      phase="a later phase"
      description="A studio-wide payment list, search and reconciliation view will be managed here. Until then, each order's payment status, method, provider reference and attempt history are already available on its order detail page, including recording a manual payment."
      action={
        <Link href="/admin/orders" className={buttonStyles({ variant: "outline" })}>
          Go to orders
        </Link>
      }
    />
  );
}
