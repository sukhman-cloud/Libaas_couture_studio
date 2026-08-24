"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resetPassword,
  type AuthFormState,
} from "@/lib/auth/customer-actions";

const initialState: AuthFormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPassword,
    initialState,
  );

  if (state.success) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.success}</Alert>
        <Link href="/login" className={buttonStyles({ className: "w-full" })}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      />
      <Input
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" className="w-full" isLoading={isPending}>
        Reset password
      </Button>
    </form>
  );
}
