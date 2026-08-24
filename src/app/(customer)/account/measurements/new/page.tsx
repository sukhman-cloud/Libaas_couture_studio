import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MeasurementForm } from "@/components/account/measurement-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";

export const metadata: Metadata = { title: "New measurement profile" };

export default async function NewMeasurementPage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/measurements/new");

  return (
    <div>
      <PageHeader
        title="New measurement profile"
        description="Fill only the measurements you know — everything is optional."
      />
      <MeasurementForm profile={null} />
    </div>
  );
}
