import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MeasurementForm } from "@/components/account/measurement-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Edit measurements" };

export default async function EditMeasurementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/measurements");

  const { id } = await params;
  const profile = await getRepositories().measurementProfiles.getById(id);

  // Ownership check: only the owner may even see that this profile exists.
  if (!profile || profile.userId !== user.id || profile.archivedAt) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={`Edit “${profile.label}”`}
        description="Values are read in the unit selected below."
      />
      <MeasurementForm profile={profile} />
    </div>
  );
}
