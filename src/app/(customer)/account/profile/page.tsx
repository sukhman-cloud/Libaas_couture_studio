import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/profile");

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your personal details."
      />
      <ProfileForm
        name={user.name}
        email={user.email ?? ""}
        phone={user.phone}
      />
    </div>
  );
}
