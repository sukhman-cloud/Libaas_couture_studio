"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loginCustomer,
  type AuthFormState,
} from "@/lib/auth/customer-actions";

const initialState: AuthFormState = {};

export function LoginForm({ from }: { from?: string }) {
  const [state, formAction, isPending] = useActionState(
    loginCustomer,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {from && <input type="hidden" name="from" value={from} />}
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" className="w-full" isLoading={isPending}>
        Sign in
      </Button>
    </form>
  );
}
