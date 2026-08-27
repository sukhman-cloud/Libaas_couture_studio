"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Radio } from "@/components/ui/radio";
import { Text } from "@/components/ui/typography";
import { AddressForm } from "@/components/account/addresses-manager";
import { saveAddressFromCheckout } from "@/lib/checkout/actions";
import type { AccountFormState } from "@/lib/account/actions";
import type { CheckoutAddress } from "@/server/checkout/service";

/**
 * Delivery-address step. Selection is a plain GET form back to /checkout
 * (?address=<id>), so it works without JavaScript, survives refresh and
 * the back button, and the server re-validates ownership on every render.
 * Adding an address reuses the account AddressForm — the one address
 * implementation — through a checkout-aware wrapper action.
 */
export function AddressSection({
  addresses,
  selectedId,
  selectionRejected,
}: {
  addresses: CheckoutAddress[];
  selectedId: string | null;
  selectionRejected: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  // A just-saved address becomes the selection: the id comes from OUR OWN
  // server response and still passes the usual ownership validation on the
  // next render — the URL is state, never trust.
  async function saveAndSelect(
    prev: AccountFormState,
    formData: FormData,
  ): Promise<AccountFormState> {
    const result = await saveAddressFromCheckout(prev, formData);
    if (result.success && result.addressId) {
      router.replace(`/checkout?address=${encodeURIComponent(result.addressId)}`);
    }
    return result;
  }

  return (
    <div className="space-y-4">
      {selectionRejected && (
        <Alert tone="danger" role="alert">
          That address is not available. Choose one of your saved addresses.
        </Alert>
      )}

      {addresses.length === 0 && !adding ? (
        <EmptyState
          icon={MapPin}
          title="Add a delivery address to continue."
          description="Your address is saved to your account for future orders."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              Add address
            </Button>
          }
        />
      ) : (
        addresses.length > 0 && (
          <form method="get" action="/checkout" className="space-y-4">
            <fieldset className="space-y-3">
              <legend className="sr-only">Choose a delivery address</legend>
              {addresses.map((address) => (
                <Card
                  key={address.id}
                  className={
                    address.id === selectedId
                      ? "border-navy-700"
                      : undefined
                  }
                >
                  <CardContent className="p-4 sm:p-5">
                    <Radio
                      name="address"
                      value={address.id}
                      defaultChecked={address.id === selectedId}
                      label={`${address.fullName} — ${address.label === "home" ? "Home" : address.label === "work" ? "Work" : "Other"}`}
                      description={[
                        address.line1,
                        address.line2,
                        address.locality,
                        `${address.city}, ${address.state} ${address.postalCode}`,
                        address.country,
                        `Phone: ${address.phone}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <div className="mt-2 flex gap-2 pl-8">
                      {address.isDefault && <Badge tone="gold">Default</Badge>}
                      {address.id === selectedId && (
                        <Badge tone="success">Delivering here</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="outline">
                Deliver to selected address
              </Button>
              {!adding && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a new address
                </Button>
              )}
            </div>
          </form>
        )
      )}

      {adding && (
        <AddressForm
          address={null}
          action={saveAndSelect}
          onDone={() => setAdding(false)}
        />
      )}

      {addresses.length > 0 && (
        <Text tone="muted" size="sm">
          Manage all addresses from your account&apos;s address book.
        </Text>
      )}
    </div>
  );
}
