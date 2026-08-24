import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { AdminSectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Admin · Appointments" };

export default function AdminAppointmentsPage() {
  return (
    <AdminSectionPlaceholder
      icon={CalendarDays}
      title="Appointments"
      phase="a later phase"
      description="Consultations, measurements and fitting appointments will be scheduled and managed here."
    />
  );
}
