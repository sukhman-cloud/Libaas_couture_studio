"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart, Plus, Scissors, ShoppingBag } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  addToCart,
  addToWishlist,
  removeFromWishlist,
  type CommerceState,
} from "@/lib/commerce/actions";
import { cn } from "@/lib/utils";

/**
 * Add-to-bag, stitching configuration and wishlist controls for the
 * product page (Phase 7A).
 *
 * The selector renders ONLY when the product's `stitchingAvailable` flag
 * is set — the server decides capability, and it re-validates everything
 * (flag, profile ownership, price) inside `addToCart` regardless of what
 * this component sends. Unstitched stays the default, so a product that
 * offers stitching still adds with one tap.
 *
 * `measurementProfiles` are the signed-in customer's own active
 * profiles, loaded server-side; ids are the customer's own row ids
 * (already visible in their account URLs).
 */
export interface MeasurementProfileOption {
  id: string;
  label: string;
  unit: "cm" | "in";
  isDefault: boolean;
}

export function ProductActions({
  slug,
  purchasable,
  signedIn,
  initiallyWishlisted,
  returnTo,
  stitchingAvailable,
  measurementProfiles,
}: {
  /** Public identifier — the internal product id never reaches the client. */
  slug: string;
  purchasable: boolean;
  signedIn: boolean;
  initiallyWishlisted: boolean;
  /** Path to come back to after signing in. */
  returnTo: string;
  stitchingAvailable: boolean;
  measurementProfiles: MeasurementProfileOption[];
}) {
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [stitched, setStitched] = useState(false);
  const defaultProfileId =
    measurementProfiles.find((profile) => profile.isDefault)?.id ??
    measurementProfiles[0]?.id ??
    "";
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const showConfigurator = purchasable && stitchingAvailable;
  const createProfileHref = `/account/measurements/new?from=${encodeURIComponent(returnTo)}`;

  function requireSignIn() {
    router.push(`/login?from=${encodeURIComponent(returnTo)}`);
  }

  function run(action: () => Promise<CommerceState>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else {
        if (result.success) toast({ title: result.success, tone: "success" });
        onDone?.();
      }
    });
  }

  function handleAdd() {
    if (!signedIn) return requireSignIn();
    if (stitched && showConfigurator) {
      if (!profileId) {
        // Same wording the server uses — this is a convenience, the
        // server rejects it authoritatively anyway.
        setConfigError("Choose a measurement profile for stitching.");
        return;
      }
      setConfigError(null);
      return run(() =>
        addToCart(slug, 1, {
          stitching: "stitched",
          measurementProfileId: profileId,
        }),
      );
    }
    setConfigError(null);
    run(() => addToCart(slug, 1, { stitching: "unstitched" }));
  }

  return (
    <div className="space-y-5">
      {showConfigurator && (
        <fieldset className="rounded-2xl border border-cream-200 p-4">
          <legend className="flex items-center gap-2 px-1 text-sm font-medium">
            <Scissors className="size-4 text-gold-600" aria-hidden />
            Stitching
          </legend>
          <div className="mt-1 space-y-3">
            <Radio
              name="stitching"
              value="unstitched"
              checked={!stitched}
              onChange={() => {
                setStitched(false);
                setConfigError(null);
              }}
              label="Unstitched"
              description="The piece as pictured — fabric and finish untouched."
            />
            <Radio
              name="stitching"
              value="stitched"
              checked={stitched}
              onChange={() => setStitched(true)}
              label="Stitched"
              description="Tailored to your measurements by the studio."
            />
          </div>

          {stitched && (
            <div className="mt-4 border-t border-cream-200 pt-4">
              {!signedIn ? (
                <p className="text-sm text-muted">
                  Sign in to use your measurement profiles — you can create
                  one in a minute.
                </p>
              ) : measurementProfiles.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">
                    You have no measurement profiles yet. Create one and
                    you&apos;ll come straight back here.
                  </p>
                  <Link
                    href={createProfileHref}
                    className={buttonStyles({ variant: "outline", size: "sm" })}
                  >
                    <Plus className="size-4" aria-hidden />
                    Create measurement profile
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <FormField label="Measurement profile">
                    <Select
                      value={profileId}
                      onChange={(event) => {
                        setProfileId(event.target.value);
                        setConfigError(null);
                      }}
                    >
                      {measurementProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                          {profile.isDefault ? " (default)" : ""} —{" "}
                          {profile.unit}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <Link
                    href={createProfileHref}
                    className="inline-flex min-h-6 items-center text-sm text-navy-700 underline underline-offset-4 hover:text-navy-900"
                  >
                    <Plus className="mr-1 size-3.5" aria-hidden />
                    Add another profile
                  </Link>
                </div>
              )}
            </div>
          )}

          <div aria-live="polite">
            {configError && (
              <p role="alert" className="mt-3 text-sm font-medium text-danger">
                {configError}
              </p>
            )}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-3">
        {purchasable && (
          <Button isLoading={isPending} onClick={handleAdd}>
            <ShoppingBag className="size-4" aria-hidden />
            {showConfigurator && stitched ? "Add to bag — stitched" : "Add to bag"}
          </Button>
        )}

        <Button
          variant="outline"
          disabled={isPending}
          aria-pressed={signedIn ? wishlisted : undefined}
          onClick={() => {
            if (!signedIn) return requireSignIn();
            if (wishlisted) {
              run(() => removeFromWishlist(slug), () => setWishlisted(false));
            } else {
              run(() => addToWishlist(slug), () => setWishlisted(true));
            }
          }}
        >
          <Heart
            className={cn("size-4", wishlisted && "fill-current text-danger")}
            aria-hidden
          />
          {wishlisted ? "Saved" : "Save to wishlist"}
        </Button>
      </div>
    </div>
  );
}
