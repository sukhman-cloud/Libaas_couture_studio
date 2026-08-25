import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LogOut,
  MapPin,
  Ruler,
  Settings,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { logoutCustomer } from "@/lib/auth/customer-actions";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Your Account" };

export default async function AccountPage() {
  const user = await getCustomerUser();
  if (!user) redirect("/login?from=/account");

  const repos = getRepositories();
  const [profile, measurements] = await Promise.all([
    repos.customers.getByUserId(user.id),
    repos.measurementProfiles.listByUserId(user.id),
  ]);
  const addresses = profile?.addresses ?? [];
  const defaultAddress = addresses.find(
    (a) => a.id === profile?.defaultAddressId,
  );

  const tiles = [
    {
      icon: UserRound,
      title: "Profile",
      href: "/account/profile",
      summary: user.email ?? "—",
      cta: "Edit profile",
    },
    {
      icon: MapPin,
      title: "Addresses",
      href: "/account/addresses",
      summary: addresses.length
        ? `${addresses.length} saved${defaultAddress ? ` · default: ${defaultAddress.label}` : ""}`
        : "No addresses saved yet",
      cta: addresses.length ? "Manage addresses" : "Add an address",
    },
    {
      icon: Ruler,
      title: "Measurements",
      href: "/account/measurements",
      summary: measurements.length
        ? `${measurements.length} profile${measurements.length > 1 ? "s" : ""} saved`
        : "No measurement profiles yet",
      cta: measurements.length ? "Manage measurements" : "Add measurements",
    },
    {
      icon: Settings,
      title: "Settings",
      href: "/account/settings",
      summary: "Password, preferences & account",
      cta: "Open settings",
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description="Your account hub — profile, addresses and measurements."
        actions={
          <form action={logoutCustomer}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full border border-navy-200 px-4 py-2 text-sm text-navy-700 transition-colors hover:bg-navy-50"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Card key={tile.title}>
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                  <tile.icon className="size-5" aria-hidden />
                </span>
                <Heading level={3} className="text-lg">
                  {tile.title}
                </Heading>
              </div>
              <Text tone="muted" size="sm" className="flex-1">
                {tile.summary}
              </Text>
              <Link
                href={tile.href}
                className={buttonStyles({ variant: "outline", size: "sm" })}
              >
                {tile.cta}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Future module — honest placeholder, no fake data */}
      <Card className="mt-4 opacity-70">
        <CardContent className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-cream-100 text-muted">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={3} className="text-lg">
                Orders
              </Heading>
              <Badge tone="neutral">Coming soon</Badge>
            </div>
            <Caption>
              Your orders and their stitching progress will appear here in a
              later phase.
            </Caption>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
