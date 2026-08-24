import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account/auth-card";
import { LoginForm } from "@/components/account/login-form";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getCustomerUser();
  if (user) redirect("/account");

  const { from } = await searchParams;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your Libaas account."
      footer={
        <>
          <p>
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-gold-700 underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
          <p className="mt-1">
            <Link
              href="/forgot-password"
              className="underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </>
      }
    >
      <LoginForm from={from} />
    </AuthCard>
  );
}
