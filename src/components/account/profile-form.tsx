"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  updateProfile,
  type AccountFormState,
} from "@/lib/account/actions";

const initialState: AccountFormState = {};

export function ProfileForm({
  name,
  email,
  phone,
}: {
  name: string;
  email: string;
  phone?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateProfile,
    initialState,
  );
  const { toast } = useToast();
  // Track the state object identity, not the message string: useActionState
  // returns a fresh object per submit, so repeat successes (same message)
  // still toast.
  const lastState = useRef<AccountFormState | null>(null);

  useEffect(() => {
    if (state.success && lastState.current !== state) {
      lastState.current = state;
      toast({ title: state.success, tone: "success" });
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="max-w-lg space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Input
        label="Full name"
        name="name"
        autoComplete="name"
        required
        defaultValue={state.values?.name ?? name}
        error={state.fieldErrors?.name}
      />
      <Input
        label="Email"
        value={email}
        readOnly
        disabled
        hint="Email changes arrive with email verification in a later phase."
      />
      <Input
        label="Phone"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        defaultValue={state.values?.phone ?? phone ?? ""}
        error={state.fieldErrors?.phone}
        hint="10-digit mobile number (optional)."
      />
      <div className="flex gap-3">
        <Button type="submit" isLoading={isPending}>
          Save changes
        </Button>
        <Button type="reset" variant="ghost" disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
