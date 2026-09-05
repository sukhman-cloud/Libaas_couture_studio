"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { RowCard, RowCardField, RowCardList, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Caption, Heading } from "@/components/ui/typography";
import {
  createStaffAccount,
  type CreateStaffFormState,
} from "@/lib/auth/actions";
import type { AdminAccountListItem } from "@/server/staff/admin";
import type { RoleName } from "@/types/domain";

const ROLE_LABELS: Record<RoleName, string> = {
  owner: "Owner",
  manager: "Manager",
  tailor: "Tailor",
  staff: "Staff",
};

const ROLE_TONES: Record<RoleName, "navy" | "gold" | "neutral"> = {
  owner: "navy",
  manager: "gold",
  tailor: "neutral",
  staff: "neutral",
};

const initialState: CreateStaffFormState = {};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function NewStaffForm() {
  const [state, formAction, isPending] = useActionState(
    createStaffAccount,
    initialState,
  );
  const { toast } = useToast();
  const lastState = useRef<CreateStaffFormState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    if (state.success) {
      toast({ title: state.success, tone: "success" });
      formRef.current?.reset();
    } else if (state.error) {
      toast({ title: state.error, tone: "danger" });
    }
  }, [state, toast]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <Heading level={3} className="text-lg">
          New staff account
        </Heading>
        <form ref={formRef} action={formAction} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              name="name"
              required
              error={state.fieldErrors?.name}
            />
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="off"
              required
              error={state.fieldErrors?.email}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Temporary password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              hint="At least 8 characters. Share it with them directly, not by email."
              error={state.fieldErrors?.password}
            />
            <FormField label="Role" error={state.fieldErrors?.role}>
              <Select name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="tailor">Tailor</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </Select>
            </FormField>
          </div>
          <Button type="submit" isLoading={isPending}>
            <Plus className="size-4" aria-hidden />
            Create account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function StaffManager({ accounts }: { accounts: AdminAccountListItem[] }) {
  const [showForm, setShowForm] = useState(accounts.length === 0);

  return (
    <div className="space-y-4">
      {accounts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No other staff accounts yet"
          description="Add the studio's team below — each person signs in with their own email and password."
        />
      ) : (
        <>
          {/* Mobile: stacked cards. sm+: table. */}
          <RowCardList>
            {accounts.map((account) => (
              <RowCard key={account.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block wrap-break-word font-medium text-navy-800">
                      {account.name}
                    </span>
                    <Caption className="block wrap-break-word">
                      {account.email ?? "No email"}
                    </Caption>
                  </div>
                  <Badge tone={ROLE_TONES[account.role]}>{ROLE_LABELS[account.role]}</Badge>
                </div>
                <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                  <RowCardField label="Status">
                    {account.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Deactivated</Badge>
                    )}
                  </RowCardField>
                  <RowCardField label="Added">
                    {dateFormatter.format(new Date(account.createdAt))}
                  </RowCardField>
                </div>
              </RowCard>
            ))}
          </RowCardList>

          <Table wrapperClassName="hidden sm:block">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Added</TH>
              </TR>
            </THead>
            <TBody>
              {accounts.map((account) => (
                <TR key={account.id}>
                  <TD className="min-w-0">
                    <span className="block wrap-break-word font-medium text-navy-800">
                      {account.name}
                    </span>
                    <Caption className="block wrap-break-word">
                      {account.email ?? "No email"}
                    </Caption>
                  </TD>
                  <TD>
                    <Badge tone={ROLE_TONES[account.role]}>{ROLE_LABELS[account.role]}</Badge>
                  </TD>
                  <TD>
                    {account.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Deactivated</Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {dateFormatter.format(new Date(account.createdAt))}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}

      {showForm ? (
        <NewStaffForm />
      ) : (
        <Button variant="outline" onClick={() => setShowForm(true)}>
          <Plus className="size-4" aria-hidden />
          Add staff account
        </Button>
      )}
    </div>
  );
}
