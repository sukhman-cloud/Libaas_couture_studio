import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MeasurementForm } from "@/components/account/measurement-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";

export const metadata: Metadata = { title: "New measurement profile" };

/** Same-origin path guard — mirrors the server action's rule, so an
 *  unsafe `from` never even renders into the form. A repeated ?from
 *  param arrives as an array and falls through to the default. */
function safeFrom(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("\\") || value.includes(":")) return undefined;
  return value;
}

export default async function NewMeasurementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/measurements/new");

  // Phase 7A: a product page configuring stitching links here with
  // ?from=/products/<slug> so the customer lands back in their
  // configuration with the new profile selectable.
  const { from } = await searchParams;
  const returnTo = safeFrom(from);

  return (
    <div>
      <PageHeader
        title="New measurement profile"
        description="Fill only the measurements you know — everything is optional."
      />
      <MeasurementForm profile={null} returnTo={returnTo} />
    </div>
  );
}
