import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddressesManager } from "@/components/account/addresses-manager";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/addresses");

  const profile = await getRepositories().customers.getByUserId(user.id);

  return (
    <div>
      <PageHeader
        title="Addresses"
        description="Saved addresses for future orders and deliveries."
      />
      <AddressesManager
        addresses={profile?.addresses ?? []}
        defaultAddressId={profile?.defaultAddressId}
      />
    </div>
  );
}
