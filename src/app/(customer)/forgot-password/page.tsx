import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account/auth-card";
import { ForgotForm } from "@/components/account/forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send a reset link if an account exists."
      footer={
        <p>
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-medium text-gold-700 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
