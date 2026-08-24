import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/account-nav";
import { Container, Section } from "@/components/ui/layout";
import { getCustomerUser } from "@/lib/auth/customer-session";

/**
 * Guarded customer account shell. The middleware already redirects
 * requests without a session cookie; this layout is the real gate — it
 * cryptographically verifies the session (and the credential's session
 * version) for every account page.
 */
export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCustomerUser();
  if (!user) {
    redirect("/login?from=/account");
  }

  return (
    <Container>
      <Section space="md">
        <div className="grid gap-6 lg:grid-cols-[210px_1fr] lg:gap-10">
          <AccountNav />
          <div className="min-w-0">{children}</div>
        </div>
      </Section>
    </Container>
  );
}
