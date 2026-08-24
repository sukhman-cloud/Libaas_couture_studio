"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  changePassword,
  deactivateAccount,
  type AuthFormState,
} from "@/lib/auth/customer-actions";
import { updateMarketingPreference } from "@/lib/account/actions";

const initialState: AuthFormState = {};

/* ── change password ────────────────────────────────────────────── */

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePassword,
    initialState,
  );
  const { toast } = useToast();
  const lastState = useRef<AuthFormState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && lastState.current !== state) {
      lastState.current = state;
      toast({ title: state.success, tone: "success" });
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Input
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <Input
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.newPassword}
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
      <Button type="submit" isLoading={isPending}>
        Update password
      </Button>
    </form>
  );
}

/* ── notification preference ────────────────────────────────────── */

export function MarketingPreference({
  initialValue,
}: {
  initialValue: boolean;
}) {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  return (
    <Switch
      label="Studio updates"
      description="New collections, offers and studio news. Order-related messages are always sent."
      checked={checked}
      disabled={isPending}
      onChange={(event) => {
        const next = event.target.checked;
        setChecked(next);
        startTransition(async () => {
          const result = await updateMarketingPreference(next);
          if (result.error) {
            setChecked(!next); // roll back on failure
            toast({ title: result.error, tone: "danger" });
          } else {
            toast({ title: "Preference saved.", tone: "success" });
          }
        });
      }}
    />
  );
}

/* ── danger zone: deactivate ────────────────────────────────────── */

export function DeactivateAccount() {
  const [state, formAction, isPending] = useActionState(
    deactivateAccount,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="max-w-md space-y-4"
        noValidate
        onSubmit={(event) => {
          // Any submit path — button click OR Enter in the password field —
          // is intercepted until the confirmation dialog is accepted.
          if (!confirmed.current) {
            event.preventDefault();
            setConfirmOpen(true);
          }
        }}
      >
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Input
          label="Confirm with your password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <Button type="submit" variant="danger" isLoading={isPending}>
          Deactivate account
        </Button>
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          confirmed.current = true;
          formRef.current?.requestSubmit();
          confirmed.current = false;
        }}
        title="Deactivate your account?"
        description="You will be signed out everywhere and can no longer sign in. Your data is preserved — contact the studio to reactivate."
        confirmLabel="Deactivate"
        destructive
        isConfirming={isPending}
      />
    </>
  );
}
