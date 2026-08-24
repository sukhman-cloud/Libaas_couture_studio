import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ChangePasswordForm,
  DeactivateAccount,
  MarketingPreference,
} from "@/components/account/settings-forms";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { logoutCustomer } from "@/lib/auth/customer-actions";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account/settings");

  const profile = await getRepositories().customers.getByUserId(user.id);
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Security, preferences and account controls."
      />

      <Card>
        <CardContent>
          <Heading level={3} className="mb-1 text-lg">
            Account information
          </Heading>
          <Text tone="muted" size="sm">
            {user.email} · Member since {memberSince}
          </Text>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Heading level={3} className="mb-4 text-lg">
            Change password
          </Heading>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Heading level={3} className="mb-4 text-lg">
            Notifications
          </Heading>
          <div className="max-w-md">
            <MarketingPreference
              initialValue={profile?.acceptsMarketing ?? false}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level={3} className="text-lg">
              Sign out
            </Heading>
            <Caption>Sign out on this device.</Caption>
          </div>
          <form action={logoutCustomer}>
            <button
              type="submit"
              className="rounded-full border border-navy-200 px-5 py-2.5 text-sm text-navy-700 transition-colors hover:bg-navy-50"
            >
              Sign out
            </button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-danger/30">
        <CardContent>
          <Heading level={3} className="mb-1 text-lg text-danger">
            Danger zone
          </Heading>
          <Text tone="muted" size="sm" className="mb-4">
            Deactivating disables sign-in and signs you out everywhere. Your
            records are preserved (not deleted) so any future orders and
            business history stay intact.
          </Text>
          <DeactivateAccount />
        </CardContent>
      </Card>
    </div>
  );
}
