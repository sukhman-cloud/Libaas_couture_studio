"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Heading, Text } from "@/components/ui/typography";
import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  type AccountFormState,
} from "@/lib/account/actions";
import type { CustomerAddress } from "@/types/domain";

const initialState: AccountFormState = {};

const labelTitles: Record<CustomerAddress["label"], string> = {
  home: "Home",
  work: "Work",
  other: "Other",
};

/**
 * The ONE address form — reused by the account page and (Phase 6A) by
 * checkout, which passes its own wrapper around the same saveAddress
 * action so the checkout route refreshes too. There is no second address
 * implementation anywhere.
 */
export function AddressForm({
  address,
  onDone,
  action = saveAddress,
}: {
  address: CustomerAddress | null;
  onDone: () => void;
  action?: (
    prev: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialState,
  );
  const { toast } = useToast();
  const doneFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.success && doneFor.current !== state.success) {
      doneFor.current = state.success;
      toast({ title: state.success, tone: "success" });
      onDone();
    }
  }, [state.success, toast, onDone]);

  const value = (key: string, fallback?: string) =>
    state.values?.[key] ?? fallback ?? "";

  return (
    <Card>
      <CardContent>
        <Heading level={3} className="mb-4 text-lg">
          {address ? "Edit address" : "Add a new address"}
        </Heading>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {address && (
            <input type="hidden" name="addressId" value={address.id} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Label" error={state.fieldErrors?.label}>
              <Select name="label" defaultValue={value("label", address?.label ?? "home")}>
                <option value="home">Home</option>
                <option value="work">Work</option>
                <option value="other">Other</option>
              </Select>
            </FormField>
            <Input
              label="Full name"
              name="fullName"
              autoComplete="name"
              required
              defaultValue={value("fullName", address?.fullName)}
              error={state.fieldErrors?.fullName}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              defaultValue={value("phone", address?.phone)}
              error={state.fieldErrors?.phone}
            />
            <Input
              label="PIN code"
              name="postalCode"
              inputMode="numeric"
              autoComplete="postal-code"
              required
              defaultValue={value("postalCode", address?.postalCode)}
              error={state.fieldErrors?.postalCode}
            />
          </div>

          <Input
            label="Address line 1"
            name="line1"
            autoComplete="address-line1"
            required
            defaultValue={value("line1", address?.line1)}
            error={state.fieldErrors?.line1}
          />
          <Input
            label="Address line 2 (optional)"
            name="line2"
            autoComplete="address-line2"
            defaultValue={value("line2", address?.line2)}
            error={state.fieldErrors?.line2}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Locality / area"
              name="locality"
              defaultValue={value("locality", address?.locality)}
              error={state.fieldErrors?.locality}
            />
            <Input
              label="City"
              name="city"
              autoComplete="address-level2"
              required
              defaultValue={value("city", address?.city)}
              error={state.fieldErrors?.city}
            />
            <Input
              label="State"
              name="state"
              autoComplete="address-level1"
              required
              defaultValue={value("state", address?.state)}
              error={state.fieldErrors?.state}
            />
          </div>

          <Input
            label="Country"
            name="country"
            autoComplete="country-name"
            defaultValue={value("country", address?.country ?? "India")}
            error={state.fieldErrors?.country}
          />

          <div className="flex gap-3">
            <Button type="submit" isLoading={isPending}>
              {address ? "Save address" : "Add address"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AddressesManager({
  addresses,
  defaultAddressId,
}: {
  addresses: CustomerAddress[];
  defaultAddressId?: string;
}) {
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [isMutating, startMutation] = useTransition();
  const { toast } = useToast();

  const editingAddress =
    editing && editing !== "new"
      ? (addresses.find((a) => a.id === editing) ?? null)
      : null;

  function runAction(action: () => Promise<AccountFormState>) {
    startMutation(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) toast({ title: result.success, tone: "success" });
    });
  }

  return (
    <div className="space-y-4">
      {addresses.length === 0 && editing === null && (
        <EmptyState
          icon={MapPin}
          title="No addresses yet"
          description="Save an address to speed up future orders and appointments."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              Add address
            </Button>
          }
        />
      )}

      {addresses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => {
            const isDefault = address.id === defaultAddressId;
            return (
              <Card key={address.id}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="navy">{labelTitles[address.label]}</Badge>
                    {isDefault && <Badge tone="gold">Default</Badge>}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-ink">{address.fullName}</p>
                    <Text tone="muted" size="sm" className="mt-1">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ""}
                      {address.locality ? `, ${address.locality}` : ""}
                      <br />
                      {address.city}, {address.state} {address.postalCode}
                      <br />
                      {address.phone}
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(address.id)}
                      disabled={isMutating}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runAction(() => setDefaultAddress(address.id))}
                        disabled={isMutating}
                      >
                        <Star className="size-3.5" aria-hidden />
                        Set default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger/10"
                      onClick={() => setDeleteTarget(address)}
                      disabled={isMutating}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== null ? (
        <AddressForm
          key={editing}
          address={editingAddress}
          onDone={() => setEditing(null)}
        />
      ) : (
        addresses.length > 0 && (
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Add another address
          </Button>
        )
      )}

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            runAction(() => deleteAddress(deleteTarget.id));
            setDeleteTarget(null);
          }
        }}
        title="Delete this address?"
        description={
          deleteTarget
            ? `"${labelTitles[deleteTarget.label]}" for ${deleteTarget.fullName} will be removed.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        isConfirming={isMutating}
      />
    </div>
  );
}
