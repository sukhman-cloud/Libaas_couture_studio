import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account/auth-card";
import { ResetForm } from "@/components/account/reset-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthCard
      title="Reset your password"
      description="Choose a new password for your account."
      footer={
        <p>
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {token ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="danger" title="Missing reset link">
          This page needs the link from your reset email. Request a new one
          from the forgot-password page.
        </Alert>
      )}
    </AuthCard>
  );
}
