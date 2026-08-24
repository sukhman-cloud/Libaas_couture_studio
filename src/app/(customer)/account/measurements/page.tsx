import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MeasurementList } from "@/components/account/measurement-list";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Measurements" };

export default async function MeasurementsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/measurements");

  const { saved } = await searchParams;
  const profiles = await getRepositories().measurementProfiles.listByCustomerId(
    user.id,
  );

  return (
    <div>
      <PageHeader
        title="Measurements"
        description="Saved measurement profiles for custom stitching — private to your account."
      />
      <MeasurementList profiles={profiles} justSaved={saved === "1"} />
    </div>
  );
}
