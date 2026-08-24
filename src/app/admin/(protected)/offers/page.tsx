import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Offers" };

export default function AdminOffersPage() {
  return (
    <AdminSectionPlaceholder
      icon={BadgePercent}
      title="Offers"
      phase="a later phase"
      description="Festive offers, discounts and promotions will be managed here."
    />
  );
}
