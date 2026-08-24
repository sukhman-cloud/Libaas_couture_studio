import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account/auth-card";
import { SignupForm } from "@/components/account/signup-form";
import { getCustomerUser } from "@/lib/auth/customer-session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getCustomerUser();
  if (user) redirect("/account");

  return (
    <AuthCard
      title="Create your account"
      description="Save measurements, addresses and orders — all in one place."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-gold-700 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
