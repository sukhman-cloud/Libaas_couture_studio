"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { allMeasurementFields } from "@/config/measurements";
import {
  addressSchema,
  measurementProfileSchema,
  parseMeasurementValues,
  profileSchema,
} from "@/lib/validation/customer";
import { mutateAccount } from "@/server/account/security";
import { getRepositories } from "@/server/data";
import { customerLockKey, withLock } from "@/server/lock";
import type { CustomerAddress, MeasurementProfile } from "@/types/domain";

/**
 * Customer-owned data mutations. EVERY action derives identity from the
 * verified session (getCustomerUser) and checks ownership server-side —
 * ids arriving from the client are never trusted on their own.
 */

export interface AccountFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Echo of submitted values so errors don't clear the form. */
  values?: Record<string, string>;
  /** Id of the address a successful saveAddress created/updated — lets
   *  checkout select the just-added address (Phase 6A). */
  addressId?: string;
}

function echoValues(formData: FormData, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

const ADDRESS_FIELD_KEYS = [
  "label",
  "fullName",
  "phone",
  "line1",
  "line2",
  "locality",
  "city",
  "state",
  "postalCode",
  "country",
];

const MEASUREMENT_FIELD_KEYS = [
  "label",
  "unit",
  "fitPreference",
  "notes",
  ...allMeasurementFields.map((f) => `m_${f.key}`),
];

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

async function requireCustomer() {
  const user = await getCustomerUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A return path is honoured only when it is a same-origin absolute path
 * — the same open-redirect discipline as the login `from` param. A
 * leading `//`, a backslash, or a scheme all fall back to the default.
 */
function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || value.includes(":")) return null;
  return value;
}

/* ── profile ────────────────────────────────────────────────────── */

export async function updateProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireCustomer();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: echoValues(formData, ["name", "phone"]),
    };
  }

  // This action writes the User row itself, which is also the row a
  // deactivation writes — so it must NOT spread the `user` read above.
  // That object is a snapshot taken before any lock, and a deactivation
  // landing in between would be silently undone by writing `isActive: true`
  // back over it. `mutateAccount` hands back the row as it exists now, and
  // refuses outright once the account is no longer active.
  const outcome = await mutateAccount(user.id, async (ctx) => {
    await ctx.tx.users.update({
      ...ctx.user,
      name: parsed.data.name,
      phone: parsed.data.phone,
      updatedAt: new Date().toISOString(),
    });
  });

  if (!outcome.ok) {
    return {
      error:
        outcome.reason === "inactive"
          ? "This account has been deactivated, so it can no longer be edited."
          : "Your session has ended. Please sign in again.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/profile");
  return { success: "Profile updated." };
}

export async function updateMarketingPreference(
  acceptsMarketing: boolean,
): Promise<AccountFormState> {
  const user = await requireCustomer();
  if (typeof acceptsMarketing !== "boolean") {
    return { error: "Invalid preference value." };
  }
  return withLock(customerLockKey(user.id), async () => {
    const repos = getRepositories();
    const profile = await repos.customers.getByUserId(user.id);
    if (!profile) return { error: "Profile not found." };

    await repos.customers.update({
      ...profile,
      acceptsMarketing,
      updatedAt: new Date().toISOString(),
    });
    revalidatePath("/account/settings");
    return { success: "Preference saved." };
  });
}

/* ── addresses ──────────────────────────────────────────────────── */

function parseAddressForm(formData: FormData) {
  return addressSchema.safeParse({
    label: formData.get("label"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    locality: formData.get("locality") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country") || "India",
  });
}

export async function saveAddress(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireCustomer();

  const parsed = parseAddressForm(formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: echoValues(formData, ADDRESS_FIELD_KEYS),
    };
  }

  const editingId = formData.get("addressId");

  return withLock(customerLockKey(user.id), async () => {
    const repos = getRepositories();
    const profile = await repos.customers.getByUserId(user.id);
    if (!profile) return { error: "Profile not found." };

    const now = new Date().toISOString();

    let savedId: string;
    if (typeof editingId === "string" && editingId) {
      // Ownership: the id must exist inside THIS customer's profile.
      const index = profile.addresses.findIndex((a) => a.id === editingId);
      if (index === -1) return { error: "Address not found." };
      const updated: CustomerAddress = {
        ...profile.addresses[index],
        ...parsed.data,
      };
      const addresses = [...profile.addresses];
      addresses[index] = updated;
      await repos.customers.update({ ...profile, addresses, updatedAt: now });
      savedId = updated.id;
    } else {
      const address: CustomerAddress = { id: randomUUID(), ...parsed.data };
      await repos.customers.update({
        ...profile,
        addresses: [...profile.addresses, address],
        // First address becomes the default automatically.
        defaultAddressId: profile.defaultAddressId ?? address.id,
        updatedAt: now,
      });
      savedId = address.id;
    }

    revalidatePath("/account/addresses");
    revalidatePath("/account");
    return { success: "Address saved.", addressId: savedId };
  });
}

export async function deleteAddress(addressId: string): Promise<AccountFormState> {
  const user = await requireCustomer();
  return withLock(customerLockKey(user.id), async () => {
    const repos = getRepositories();
    const profile = await repos.customers.getByUserId(user.id);
    if (!profile) return { error: "Profile not found." };

    if (!profile.addresses.some((a) => a.id === addressId)) {
      return { error: "Address not found." };
    }

    const addresses = profile.addresses.filter((a) => a.id !== addressId);
    await repos.customers.update({
      ...profile,
      addresses,
      defaultAddressId:
        profile.defaultAddressId === addressId
          ? addresses[0]?.id
          : profile.defaultAddressId,
      updatedAt: new Date().toISOString(),
    });

    revalidatePath("/account/addresses");
    revalidatePath("/account");
    return { success: "Address deleted." };
  });
}

export async function setDefaultAddress(
  addressId: string,
): Promise<AccountFormState> {
  const user = await requireCustomer();
  return withLock(customerLockKey(user.id), async () => {
    const repos = getRepositories();
    const profile = await repos.customers.getByUserId(user.id);
    if (!profile) return { error: "Profile not found." };

    if (!profile.addresses.some((a) => a.id === addressId)) {
      return { error: "Address not found." };
    }

    await repos.customers.update({
      ...profile,
      defaultAddressId: addressId,
      updatedAt: new Date().toISOString(),
    });

    revalidatePath("/account/addresses");
    return { success: "Default address updated." };
  });
}

/* ── measurement profiles ───────────────────────────────────────── */

/** Load a measurement profile ONLY if it belongs to the signed-in user. */
async function getOwnedMeasurementProfile(
  userId: string,
  profileId: string,
): Promise<MeasurementProfile | null> {
  const repos = getRepositories();
  const profile = await repos.measurementProfiles.getById(profileId);
  if (!profile || profile.userId !== userId || profile.archivedAt) {
    return null;
  }
  return profile;
}

export async function saveMeasurementProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireCustomer();

  // Echo everything the user typed so validation errors never wipe the form.
  const echoed = echoValues(formData, MEASUREMENT_FIELD_KEYS);

  const parsed = measurementProfileSchema.safeParse({
    label: formData.get("label"),
    unit: formData.get("unit"),
    fitPreference: formData.get("fitPreference"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues), values: echoed };
  }

  const { values, errors } = parseMeasurementValues(formData, parsed.data.unit);
  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors, values: echoed };
  }
  if (values.length === 0) {
    return { error: "Enter at least one measurement.", values: echoed };
  }

  const editingId = formData.get("profileId");

  const result = await withLock(
    customerLockKey(user.id),
    async (): Promise<AccountFormState | null> => {
      const repos = getRepositories();
      const now = new Date().toISOString();

      if (typeof editingId === "string" && editingId) {
        const existing = await getOwnedMeasurementProfile(user.id, editingId);
        if (!existing) {
          return { error: "Measurement profile not found.", values: echoed };
        }
        await repos.measurementProfiles.update({
          ...existing,
          label: parsed.data.label,
          unit: parsed.data.unit,
          fitPreference: parsed.data.fitPreference,
          notes: parsed.data.notes,
          values,
          updatedAt: now,
        });
      } else {
        const siblings = await repos.measurementProfiles.listByUserId(
          user.id,
        );
        await repos.measurementProfiles.create({
          id: randomUUID(),
          userId: user.id,
          label: parsed.data.label,
          unit: parsed.data.unit,
          fitPreference: parsed.data.fitPreference,
          notes: parsed.data.notes,
          values,
          isDefault: siblings.length === 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      return null; // success
    },
  );
  if (result) return result;

  revalidatePath("/account/measurements");
  revalidatePath("/account");
  // Phase 7A: a profile created mid-configuration (e.g. from a product
  // page) returns to where the customer was, so the new profile can be
  // selected immediately. The path is validated — never an open redirect.
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (returnTo) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }
  redirect("/account/measurements?saved=1");
}

export async function archiveMeasurementProfile(
  profileId: string,
): Promise<AccountFormState> {
  const user = await requireCustomer();
  return withLock(customerLockKey(user.id), async () => {
    const profile = await getOwnedMeasurementProfile(user.id, profileId);
    if (!profile) return { error: "Measurement profile not found." };

    const repos = getRepositories();
    const now = new Date().toISOString();
    // Soft delete — preserved for any future orders that reference it.
    await repos.measurementProfiles.update({
      ...profile,
      isDefault: false,
      archivedAt: now,
      updatedAt: now,
    });

    // Promote another profile to default if the default was archived.
    if (profile.isDefault) {
      const remaining = await repos.measurementProfiles.listByUserId(
        user.id,
      );
      if (remaining.length > 0) {
        await repos.measurementProfiles.update({
          ...remaining[0],
          isDefault: true,
          updatedAt: now,
        });
      }
    }

    revalidatePath("/account/measurements");
    revalidatePath("/account");
    return { success: "Measurement profile deleted." };
  });
}

export async function setDefaultMeasurementProfile(
  profileId: string,
): Promise<AccountFormState> {
  const user = await requireCustomer();
  return withLock(customerLockKey(user.id), async () => {
    const target = await getOwnedMeasurementProfile(user.id, profileId);
    if (!target) return { error: "Measurement profile not found." };

    const repos = getRepositories();
    const now = new Date().toISOString();
    const all = await repos.measurementProfiles.listByUserId(user.id);
    for (const profile of all) {
      const shouldBeDefault = profile.id === profileId;
      if (profile.isDefault !== shouldBeDefault) {
        await repos.measurementProfiles.update({
          ...profile,
          isDefault: shouldBeDefault,
          updatedAt: now,
        });
      }
    }

    revalidatePath("/account/measurements");
    return { success: "Default profile updated." };
  });
}

export async function duplicateMeasurementProfile(
  profileId: string,
): Promise<AccountFormState> {
  const user = await requireCustomer();
  return withLock(customerLockKey(user.id), async () => {
    const source = await getOwnedMeasurementProfile(user.id, profileId);
    if (!source) return { error: "Measurement profile not found." };

    const repos = getRepositories();
    const now = new Date().toISOString();
    await repos.measurementProfiles.create({
      ...source,
      id: randomUUID(),
      label: `${source.label} (copy)`.slice(0, 40),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath("/account/measurements");
    return { success: "Profile duplicated." };
  });
}
