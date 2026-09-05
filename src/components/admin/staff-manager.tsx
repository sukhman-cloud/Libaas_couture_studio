"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { RowCard, RowCardField, RowCardList, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Caption, Heading } from "@/components/ui/typography";
import {
  changeStaffRole,
  createStaffAccount,
  deactivateStaffAccount,
  reactivateStaffAccount,
  type CreateStaffFormState,
  type StaffMutationState,
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
  const [role, setRole] = useState<RoleName>("staff");
  const [confirmOwner, setConfirmOwner] = useState(false);
  const ownerConfirmed = useRef(false);

  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    if (state.success) {
      toast({ title: state.success, tone: "success" });
      formRef.current?.reset();
      setRole("staff");
      ownerConfirmed.current = false;
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
        <form
          ref={formRef}
          action={formAction}
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            if (role === "owner" && !ownerConfirmed.current) {
              event.preventDefault();
              setConfirmOwner(true);
            }
          }}
        >
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
            <PasswordInput
              label="Temporary password"
              name="password"
              autoComplete="new-password"
              required
              hint="At least 8 characters. Share it with them directly, not by email."
              error={state.fieldErrors?.password}
            />
            <FormField label="Role" error={state.fieldErrors?.role}>
              <Select
                name="role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as RoleName);
                  ownerConfirmed.current = false;
                }}
              >
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

        <ConfirmationDialog
          open={confirmOwner}
          onClose={() => setConfirmOwner(false)}
          onConfirm={() => {
            setConfirmOwner(false);
            ownerConfirmed.current = true;
            formRef.current?.requestSubmit();
          }}
          title="Create an owner account?"
          description="Owner has full access to every part of the admin, including staff, payments and settings. Only give this role to someone who should have complete control."
          confirmLabel="Create owner account"
        />
      </CardContent>
    </Card>
  );
}

const initialMutationState: StaffMutationState = {};

function useStaffMutationToast(state: StaffMutationState) {
  const { toast } = useToast();
  const last = useRef<StaffMutationState | null>(null);
  useEffect(() => {
    if (last.current === state) return;
    last.current = state;
    if (state.success) toast({ title: state.success, tone: "success" });
    else if (state.error) toast({ title: state.error, tone: "danger" });
  }, [state, toast]);
}

/** Role-change select for one staff row, or a static badge when the signed-
 *  in admin isn't allowed to change it (self, or a non-owner viewing an
 *  owner). Editability is re-checked server-side regardless. */
function StaffRoleControl({
  account,
  canEditRole,
}: {
  account: AdminAccountListItem;
  canEditRole: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState<StaffMutationState, FormData>(
    changeStaffRole,
    initialMutationState,
  );
  useStaffMutationToast(roleState);

  if (!canEditRole) {
    return <Badge tone={ROLE_TONES[account.role]}>{ROLE_LABELS[account.role]}</Badge>;
  }

  return (
    <form action={roleAction}>
      <input type="hidden" name="userId" value={account.id} />
      <Select
        name="role"
        defaultValue={account.role}
        disabled={rolePending}
        aria-label={`Change role for ${account.name}`}
        className="h-11 min-w-28 text-sm"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="staff">Staff</option>
        <option value="tailor">Tailor</option>
        <option value="manager">Manager</option>
        <option value="owner">Owner</option>
      </Select>
    </form>
  );
}

/** Deactivate/reactivate control for one staff row, with a confirmation
 *  dialog gating the destructive (deactivate) direction only. */
function StaffStatusControl({ account }: { account: AdminAccountListItem }) {
  const [statusState, statusAction, statusPending] = useActionState<StaffMutationState, FormData>(
    account.isActive ? deactivateStaffAccount : reactivateStaffAccount,
    initialMutationState,
  );
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const statusFormRef = useRef<HTMLFormElement>(null);

  useStaffMutationToast(statusState);

  return (
    <>
      <form
        ref={statusFormRef}
        action={statusAction}
        onSubmit={(event) => {
          if (account.isActive) {
            event.preventDefault();
            setConfirmDeactivate(true);
          }
        }}
      >
        <input type="hidden" name="userId" value={account.id} />
        <Button
          type="submit"
          size="sm"
          variant={account.isActive ? "outline" : "primary"}
          isLoading={statusPending}
        >
          {account.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </form>

      <ConfirmationDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => {
          setConfirmDeactivate(false);
          statusFormRef.current?.requestSubmit();
        }}
        title={`Deactivate ${account.name}?`}
        description="They will be signed out immediately and won't be able to sign back in until reactivated."
        confirmLabel="Deactivate"
        destructive
        isConfirming={statusPending}
      />
    </>
  );
}

export function StaffManager({
  accounts,
  currentUserId,
  currentUserRole,
}: {
  accounts: AdminAccountListItem[];
  currentUserId: string;
  currentUserRole: RoleName;
}) {
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
            {accounts.map((account) => {
              const isSelf = account.id === currentUserId;
              const canManage = !isSelf && (currentUserRole === "owner" || account.role !== "owner");
              return (
                <RowCard key={account.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block wrap-break-word font-medium text-navy-800">
                        {account.name}
                        {isSelf && <Caption className="ml-1 inline">(you)</Caption>}
                      </span>
                      <Caption className="block wrap-break-word">
                        {account.email ?? "No email"}
                      </Caption>
                    </div>
                    {!canManage && <Badge tone={ROLE_TONES[account.role]}>{ROLE_LABELS[account.role]}</Badge>}
                  </div>
                  <div className="mt-3 space-y-2 border-t border-cream-200 pt-3">
                    {canManage && (
                      <RowCardField label="Role">
                        <StaffRoleControl account={account} canEditRole={canManage} />
                      </RowCardField>
                    )}
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
                    {canManage && (
                      <div className="flex justify-end pt-1">
                        <StaffStatusControl account={account} />
                      </div>
                    )}
                  </div>
                </RowCard>
              );
            })}
          </RowCardList>

          <Table wrapperClassName="hidden sm:block">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Added</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {accounts.map((account) => {
                const isSelf = account.id === currentUserId;
                const canManage = !isSelf && (currentUserRole === "owner" || account.role !== "owner");
                return (
                  <TR key={account.id}>
                    <TD className="min-w-0">
                      <span className="block wrap-break-word font-medium text-navy-800">
                        {account.name}
                        {isSelf && <Caption className="ml-1 inline">(you)</Caption>}
                      </span>
                      <Caption className="block wrap-break-word">
                        {account.email ?? "No email"}
                      </Caption>
                    </TD>
                    <TD>
                      <StaffRoleControl account={account} canEditRole={canManage} />
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
                    <TD className="min-w-0">
                      {canManage ? <StaffStatusControl account={account} /> : <Caption>—</Caption>}
                    </TD>
                  </TR>
                );
              })}
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
